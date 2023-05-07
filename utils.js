import { sep, join, resolve } from 'path';
import { nanoid } from 'nanoid';
import { readdir } from 'fs/promises';

export const getGptModels = () => [
	{
		id: 'text-embedding-ada-002',
		model:
			'/Users/eirikprivat/Development/ai/llama.cpp/models/vicuna/ggml-vic7b-q5_1.bin',
	},
	{ id: 'gpt-3.5-turbo', model: process.env.DEFAULT_MODEL },
	{ id: 'text-davinci-003', model: process.env.DEFAULT_MODEL },
	{
		id: 'vicuna-13b',
		model:
			'/Users/eirikprivat/Development/ai/llama.cpp/models/vicuna/ggml-vic13b-q5_1.bin',
	},
	{
		id: 'vicuna-13b-uncensored',
		model:
			'/Users/eirikprivat/Development/ai/llama.cpp/models/vicuna/ggml-vic13b-uncensored-q5_1.bin',
	},
	{
		id: 'vicuna-7b',
		model:
			'/Users/eirikprivat/Development/ai/llama.cpp/models/vicuna/ggml-vic7b-q5_1.bin',
	},
	{
		id: 'gpt4-x-vicuna-13b',
		model:
			'/Users/eirikprivat/Development/ai/llama.cpp/models/vicuna/gpt4-x-vicuna-13B.ggml.q5_1.bin',
	},
	{
		id: 'gpt4all-j-v1.3-groovy',
		model:
			'/Users/eirikprivat/Development/ai/llama.cpp/models/gpt4all/ggml-gpt4all-j-v1.3-groovy.bin',
	},
	{
		id: 'gpt4all-l13b-snoozy',
		model:
			'/Users/eirikprivat/Development/ai/llama.cpp/models/gpt4all/ggml-gpt4all-l13b-snoozy.bin',
	},
];

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

export function normalizeVector(vector) {
	// Calculate the magnitude (length) of the vector
	const magnitude = Math.sqrt(
		vector.reduce((sum, value) => sum + value * value, 0)
	);

	// Check if the magnitude is not zero, to avoid division by zero
	if (magnitude === 0) {
		throw new Error('Cannot normalize a vector with magnitude 0');
	}

	// Normalize the vector by dividing each element by the magnitude
	const normalizedVector = vector.map((value) => value / magnitude);

	return normalizedVector;
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
					text_offset: [],
					token_logprobs: [],
					tokens: [],
					top_logprobs: [],
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

export const dataToEmbeddingResponse = (embeddings) => {
	return {
		object: 'list',
		data: embeddings.map((embedding, index) => ({
			object: 'embedding',
			embedding,
			index,
		})),
		embeddingSize: embeddings[0].length,
	};
};

export const getModelPath = (modelId) => {
	let gptModelMatch = getGptModels().find(
		(gptModel) => modelId === gptModel.id
	);
	console.log({ gptModelMatch, gptModels: getGptModels(), modelId });
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
