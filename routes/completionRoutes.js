import express from 'express';
import { spawn } from 'child_process';
import { join } from 'path';
import {
	stripAnsiCodes,
	getLlamaPath,
	getModelPath,
	dataToCompletionResponse,
} from '../utils.js';
import { getArgs } from '../defaults.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Chat
 *   description: API for generating chatbot completions using the LLM model
 * /v1/chat/completions:
 *   post:
 *     summary: Generate text completions using LLM model
 *     tags:
 *       - Chat
 *     description: Creates a completion for the prompt
 *     requestBody:
 *       description: Object containing inputs for generating text completions
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               model:
 *                 type: string
 *                 description: The ID of the LLM model to use for generating completions (this currently makes no difference)
 *               stream:
 *                 type: boolean
 *                 description: If true, the response will be streamed as a series of chunks. If false, the entire response will be returned in a single JSON object.
 *               prompt:
 *                 type: string
 *                 description: The messages to generate completions for.
 *     responses:
 *       '200':
 *         description: A response object containing the generated chatbot completions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 choices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       text:
 *                         type: string
 *                         description: Completion text result
 */

router.post('/completions', async (req, res) => {
	global.serverBusy = true;
	console.log(`\n=====  TEXT COMPLETION REQUEST  =====`);

	console.log(JSON.stringify(req.body, null, 2))

	const llamaPath = getLlamaPath();
	const modelPath = getModelPath(req.body.model);
	const scriptPath = join(llamaPath, 'main');

	const stream = req.body.stream;

	if (!modelPath) {
		return res.status(500).send('re-run Herd with MODEL= variable set.');
	}

	const stopPrompts = req.body.stop || [];
	const stopArgs = stopPrompts.flatMap((s) => ['--reverse-prompt', s]);
	const args = getArgs(req.body);
	const prompt = req.body.prompt;
	const maxTokens = req.body['max_tokens'];

	// important variables
	let responseContent = '';

	const promptTokens = Math.ceil(prompt.length / 4);
	let completionTokens = 0;

	!!global.childProcess && global.childProcess.kill('SIGINT');
	
	const scriptArgs = [
		'--threads',
		process.env.THREADS || '7',
		'-m',
		modelPath,
		...args,
		...stopArgs,
		'-p',
		prompt,
	];

	global.childProcess = spawn(scriptPath, scriptArgs);
	console.log(`\n=====  LLAMA.CPP SPAWNED  =====`);
	console.log(`${scriptPath} ${scriptArgs.join(' ')}\n`);

	console.log(`\n=====  REQUEST  =====\n${req.body.prompt}`);

	let stdoutStream = global.childProcess.stdout;

	let totalOutput = '';

	const readable = new ReadableStream({
		start(controller) {
			const decoder = new TextDecoder();
			const onData = (chunk) => {
				const data = stripAnsiCodes(decoder.decode(chunk));

				// Check if we've gotten the entire initial prompt (which we do not want to echo back)
				if (totalOutput !== ` ${prompt}`) {
					totalOutput += data;
					return;
				}

				process.stdout.write(data);
				controller.enqueue(
					dataToCompletionResponse(data, promptTokens, completionTokens, stream)
				);
			};

			const onClose = () => {
				// Send an empty delta to signify that the llama.cpp response ended
				controller.enqueue(
					dataToCompletionResponse("", promptTokens, completionTokens, stream, "stop")
				);
				global.serverBusy = false;
				console.log('Readable Stream: CLOSED');
				controller.close();
			};

			const onError = (error) => {
				console.log('Readable Stream: ERROR');
				console.log(error);
				controller.error(error);
			};

			stdoutStream.on('data', onData);
			stdoutStream.on('close', onClose);
			stdoutStream.on('error', onError);
		},
	});

	let debounceTimer;
	if (stream) {
		// If streaming, return an event-stream
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive',
		});
		let previousChunk; // in case stop prompts are longer, lets combine the last 2 chunks to check
		let wasStopped = false;
		const writable = new WritableStream({
			write(chunk) {
				const currContent = chunk.choices[0].text;
				const outputEnded = !currContent;

				// Sliding window of 2 chunks to be able to check for stop words
				const previousContent = !!previousChunk
					? previousChunk.choices[0].text
					: undefined;
				const last2Content = !!previousContent
					? previousContent + currContent
					: currContent;

				//console.log({ currContent, previousContent, last2Content });

				// TODO: Check if encountered stop token (use 2 chunks like the chat route - or more if necessary)
				// Buffer up the previous chunk
				// Always check the last two chunks and then reply with the oldest chunk if the last 2 combined is not a stopword
				// When reaching the "" chunk - if the last two is not a stopword send both chunks.
				// If it is a stop word then send only the "" chunk + [DONE] status

				// Check if any of the stop prompts appeared in
				// the response and abort if that is the case
				let stopPromptAppearedInCurrentChunk = stopPrompts
				.some(stopPrompt => currContent.includes(stopPrompt));

				let stopPromptAppearedInLastChunk = stopPrompts
				.some(stopPrompt => (previousContent || "").includes(stopPrompt));

				let stopPromptAppearedInLast2Chunks = stopPrompts
				.some(stopPrompt => last2Content.includes(stopPrompt));

				let stopPromptAppeared = stopPromptAppearedInLast2Chunks || stopPromptAppearedInCurrentChunk;

				// Add to total token count before checking if we've reached max tokens
				completionTokens++;
				responseContent += currContent;
				!!debounceTimer && clearTimeout(debounceTimer);

				let hasReachedMaxLength = completionTokens >= maxTokens;

				if (
					!hasReachedMaxLength &&
					!wasStopped &&
					!stopPromptAppeared &&
					!stopPromptAppearedInLastChunk &&
					!!previousChunk
				) {
					//console.log('writing previous chunk');
					res.write('event: data\n');
					res.write(`data: ${JSON.stringify(previousChunk)}\n\n`);
				}

				// Set flag to signify that a stop has been encountered (to ensure we don't respond with the stop token)
				wasStopped = wasStopped || stopPromptAppeared || hasReachedMaxLength;
				
				// Check if we hit the end of the llama.cpp output and end the request
				if (outputEnded) {
					console.log('Request DONE')
					res.write('event: data\n');
					res.write(`data: ${JSON.stringify(chunk)}\n\n`);
					res.write('event: data\n');
					res.write('data: [DONE]\n\n');
					global.serverBusy = false;
					stdoutStream.removeAllListeners();
					clearTimeout(debounceTimer);
					res.end();
					return;
				}

				if (stopPromptAppeared || hasReachedMaxLength) {
					console.log('==== STOP PROMPT APPEARED ====');
					!!global.childProcess && global.childProcess.kill('SIGINT');
				} else {
					debounceTimer = setTimeout(() => {
						console.log(
							'> LLAMA.CPP UNRESPONSIVE FOR 20 SECS. ATTEMPTING TO RESUME GENERATION..'
						);
						global.childProcess.stdin.write('\n');
					}, 20000);
				}
				
				previousChunk = chunk;
			},
		});

		readable.pipeTo(writable);
	}
	// Return a single json response instead of streaming
	else {
		const writable = new WritableStream({
			write(chunk) {
				const currContent = chunk.choices[0].text;
				
				// If we detect the end of the completion - return response
				if (!currContent) {
					console.log('Request DONE');

					res
						.status(200)
						.json(
							dataToCompletionResponse(
								responseContent,
								promptTokens,
								completionTokens,
								stream,
								'stop'
							)
						);
					
					global.serverBusy = false;
					stdoutStream.removeAllListeners();
					clearTimeout(debounceTimer);
				} else {
					let stopPromptAppeared = stopPrompts.some(stopPrompt => (responseContent + currContent).includes(stopPrompt))
					// Add the delta content into the complete response content
					if (!stopPromptAppeared) {
						responseContent += currContent;
						completionTokens++;
					}

					const hasReachedMaxLength = completionTokens >= maxTokens;

					!!debounceTimer && clearTimeout(debounceTimer);

					// Detect any of the stop prompts and abort the process
					if (stopPromptAppeared || hasReachedMaxLength) {
						!!global.childProcess && global.childProcess.kill('SIGINT');
					} else {
						debounceTimer = setTimeout(() => {
							console.log(
								'> LLAMA.CPP UNRESPONSIVE FOR 20 SECS. ATTEMPTING TO RESUME GENERATION..'
							);
							global.childProcess.stdin.write('\n');
						}, 20000);
					}
				}
			},
		});
		readable.pipeTo(writable);
	}
});

export default router;
