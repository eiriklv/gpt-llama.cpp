import sys
import json
from json import JSONEncoder
import numpy

from sentence_transformers import SentenceTransformer

class NumpyArrayEncoder(JSONEncoder):
    def default(self, obj):
        if isinstance(obj, numpy.ndarray):
            return obj.tolist()
        return JSONEncoder.default(self, obj)

input_path = sys.argv[1]
model_id = sys.argv[2] if sys.argv[2] is not None else "all-mpnet-base-v2"
selected_model = model_id

if model_id == "text-embedding-ada-002":
    selected_model = "msmarco-distilbert-base-v4"   

model = SentenceTransformer(f"sentence-transformers/{selected_model}", device="cpu")

# Returns a comma separated embedding
def get_sbert_embedding(sentences):
    embeddings = model.encode(sentences)
    return embeddings

with open(input_path, "r") as f:
    input = f.read()
    parsed_input = json.loads(input)

print(json.dumps(get_sbert_embedding(parsed_input).tolist()), end="")
