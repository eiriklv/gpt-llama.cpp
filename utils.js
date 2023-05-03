import { sep, join, resolve } from 'path';
import { nanoid } from 'nanoid';
import { readdir } from 'fs/promises';

export const getGptModels = () => [
	{ id: 'gpt-3.5-turbo', model: process.env.DEFAULT_MODEL },
	{ id: 'gpt-4', model: process.env.DEFAULT_MODEL },
	{ id: 'text-davinci-003', model: process.env.DEFAULT_MODEL },
]

export async function* getFiles(dir) {
	const dirents = await readdir(dir, { withFileTypes: true });
	for (const dirent of dirents) {
		const res = resolve(dir, dirent.name);
		if (dirent.isDirectory()) {
			yield* getFiles(res);
		} else {
			const currFile = res.split('.');
			if (currFile[currFile.length - 1] === 'bin') {
				yield res;
			}
		}
	}
}

export function stripAnsiCodes(str) {
	return str.replace(/\u001b\[\d+m/g, '');
}

export const messagesToString = (messages, newLine = false) => {
	const whitespace = newLine ? `\\\n` : ` `;
	return messages
		.map((m) => {
			return `${m.role || 'assistant'}:${whitespace}${m.content}`;
		})
		.join('\n');
};

export const dataToChatResponse = (
	data,
	promptTokens,
	completionTokens,
	stream = false,
	reason = null
) => {
	const currDate = new Date();
	const contentData = { content: data, role: 'assistant' };
	const contentName = stream ? 'delta' : 'message';

	return {
		choices: [
			{
				[contentName]: !!data ? contentData : {},
				finish_reason: reason,
				index: 0,
			},
		],
		created: currDate.getTime(),
		id: nanoid(),
		object: 'chat.completion.chunk',
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
		},
	};
};

export const dataToCompletionResponse = (
	data,
	promptTokens,
	completionTokens,
	stream = false,
	reason = null
) => {
	const currDate = new Date();

	return {
		choices: [
			{
				text: data,
				finish_reason: reason,
				index: 0,
				logprobs: {
					text_offset: [0],
					token_logprobs: [0],
					tokens: [''],
					top_logprobs: [
						{
							' example': 0,
						},
					],
				},
			},
		],
		created: currDate.getTime(),
		id: nanoid(),
		object: 'text_completion',
		usage: {
			prompt_tokens: promptTokens,
			completion_tokens: completionTokens,
			total_tokens: promptTokens + completionTokens,
		},
	};
};

export const dataToEmbeddingResponse = (output) => {
	return {
		object: 'list',
		data: [
			{
				object: 'embedding',
				embedding: output,
				index: 0,
			},
		],
		embeddingSize: output.length,
	};
};

export const getModelPath = (modelId) => {
	let gptModelMatch = getGptModels().find(gptModel => modelId === gptModel.id);
	console.log({ gptModelMatch, gptModels: getGptModels(), modelId })
	return gptModelMatch ? gptModelMatch.model : modelId;
};

// Normalizes and fixes all the slahses for Win/Mac
export const normalizePath = (path) =>
	sep === '\\' ? path.replace(/\//g, '\\') : path.replace(/\\/g, '/');

const splitPath = (path) => path.split(/[\/\\]/);

export const getModelName = (path) => {
	const normalizedPath = normalizePath(path);
	const modelArr = splitPath(normalizedPath);
	return modelArr[modelArr.length - 1];
};

export const getLlamaPath = (req, res) => {
	// const modelPath = getModelPath(req, res);
	// const path = modelPath.split('llama.cpp')[0]; // only
	// return join(path, 'llama.cpp');
	return process.env.LLAMA_PATH;
};

export const compareArrays = (arr1, arr2) => {
	if (arr1.length !== arr2.length) {
		return false;
	}

	for (let i = 0; i < arr1.length; i++) {
		const obj1 = arr1[i];
		const obj2 = arr2[i];

		if (JSON.stringify(obj1) !== JSON.stringify(obj2)) {
			console.log(`${JSON.stringify(obj1)} !== ${JSON.stringify(obj2)}`);
			return false;
		}
	}

	return true;
};
