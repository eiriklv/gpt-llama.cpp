import express from 'express';
import {
	getLlamaPath,
	getFiles,
	getGptModels,
} from '../utils.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Models
 *   description: API for retrieving LLM models
 * /v1/models:
 *   get:
 *     summary: Get all LLM models
 *     tags:
 *       - Models
 *     description: Retrieve a list of all available LLM models
 *     responses:
 *       '200':
 *         description: A list of LLM models
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     description: The ID of the GPT model (3.5-turbo or 4)
 *                   object:
 *                     type: string
 *                     description: The path to the .bin model file
 *                   owned_by:
 *                     type: string
 *                     description: The owner of the LLM model
 *                   permission:
 *                     type: array
 *                     description: The list of users who have permission to access the GPT model
 *                     items:
 *                       type: string
 *             examples:
 *               [{
 *                 "id": "3.5",
 *                 "object": "modelName",
 *                 "owned_by": "user",
 *                 "permission": []
 *               }]
 */
router.get('/', async (req, res) => {
	// const modelPath = getModelPath(req, res);
	// if (!modelPath) {
	// 	return res
	// 		.status(403)
	// 		.send(
	// 			'Missing API_KEY. Please set up your API_KEY (in this case path to model .bin in your ./llama.cpp folder). '
	// 		);
	// }
	// const modelName = getModelName(modelPath);

	// // Map the user-defined model to gpt-3-turbo
	// const data = [
	// 	{
	// 		id: gptModelNames['3.5'],
	// 		object: modelName,
	// 		owned_by: 'user',
	// 		permission: [],
	// 	},
	// 	{
	// 		id: gptModelNames['4'],
	// 		object: modelName,
	// 		owned_by: 'user',
	// 		permission: [],
	// 	},
	// ];

	const llamaPath = getLlamaPath();

	const models = [];
	for await (const f of getFiles(`${llamaPath}/models/`)) {
		models.push(f);
	}

	const data = [
		...models.map((m) => ({
			id: m,
			object: 'model',
			owned_by: 'user',
			permission: [],
		})),
		...getGptModels().map((m) => ({
			id: m.id,
			object: 'model',
			owned_by: 'user',
			permission: [],
		}))
	];

	res.status(200).json({ data });
});

export default router;
