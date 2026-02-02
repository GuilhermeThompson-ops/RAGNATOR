# RAGNATOR v3.2

**Transform PDFs and EPUBs into RAG-ready datasets — fast, structured, and traceable.**

***

## The Problem

You have hundreds of PDFs/EPUBs (gigabytes of text) and you need them **queryable** in a RAG system (Perplexity, vector databases, LLMs with retrieval). Direct upload is slow, unstructured, and lacks metadata for source tracking.

**Ragnator solves this** by converting documents into structured chunks with page-level traceability, enforcing size limits for reliable uploads, and running 100% in-browser (no backend, zero data leakage).

***

## What It Does

- ✅ **Smart chunking**: 1500-char target size, 200-char overlap, splits on sentence/paragraph boundaries
- ✅ **Page tracking**: every chunk knows its source file + page number
- ✅ **Two output modes**:
  - **Standard TXT**: human-readable blocks with `[METADATA: Source="..." | Page=X]` headers
  - **Perplexity NDJSON**: JSON Lines format with `{id, source, page, content, tokens, created_at}`
- ✅ **Batch processing**: queue multiple files, process sequentially
- ✅ **38.5MB bundle limit**: automatic packaging to fit platform upload constraints
- ✅ **Zero backend**: built with React + pdf.js + JSZip (runs entirely in your browser)

***

## Quick Start (2 Options)

### Option 1: AI Canvas (No Install, Easiest)

1. Copy the full code from [`RAGNATOR_v3_NDJSON.jsx`](https://github.com/GuilhermeThompson-ops/RAGNATOR/blob/main/RAGNATOR_v3_NDJSON.jsx)
2. Paste into:
   - **Google AI Studio Canvas** ([aistudio.google.com](https://aistudio.google.com/))
   - **Gemini Code Interpreter**
   - **Claude Artifacts** (via Anthropic Console)
3. Run the generated interface and upload your PDFs/EPUBs directly

### Option 2: Local Dev (npm)

```bash
git clone https://github.com/GuilhermeThompson-ops/RAGNATOR.git
cd RAGNATOR
npm install
npm start
```

Then:
1. Drag PDFs/EPUBs into the upload zone
2. Click **"Generate Standard TXT"** (for simple text blocks) or **"Generate Perplexity NDJSON"** (for vector DB ingestion)
3. Download the ZIP package with your dataset + metadata manifest

***

## Real-World Quality Test

**Input**: 2 PDFs (*Rich Dad Poor Dad* by Robert Kiyosaki + *Understanding Michael Porter* by Joan Magretta)  
**Output**: 1 consolidated TXT file, 891k characters, ~460 chunks  

**Validation results**:
- ✅ Narrative flow preserved (introduction → body → examples in logical order)
- ✅ Metadata accurate (source + page number per chunk)
- ✅ Minimal OCR noise (smart text normalization removes control characters, extra spaces, and page markers)

**Sample output block**:
```
[METADATA: Source="Rich Dad, Poor Dad -- Kiyosaki, Robert -- 2010.pdf" | Page=3]
---
Rich Dad, Poor Dad 
Rich Dad, Poor Dad Rich Dad, Poor Dad By Robert T. Kiyosaki INTRODUCTION 
There is a Need Does school prepare children for the real world? "Study hard 
and get good grades and you will find a high-paying job with great benefits," 
my parents used to say...
---
```

***

## Known Limitations (and How to Fix Them)

Ragnator produces **"good enough"** output for most RAG use cases, but if you need higher quality for scientific/legal/precision work, here's what you can do:

### 1. OCR Artifacts (broken hyphens, garbled text)

**Problem**: PDFs with poor text layers can produce chunks like `"strate-gy"` or `"th e"`.

**DIY Fix**:  
Pass your output through an LLM for post-processing. Example prompt for ChatGPT/Claude:

```
You are a text cleanup assistant. Fix OCR errors in the following chunk while preserving the original meaning and structure. Only fix obvious errors (broken hyphens, extra spaces, garbled characters). Do not rephrase or summarize.

[paste chunk here]
```

Automate this with a simple Python script using OpenAI/Anthropic APIs to batch-process all chunks.

***

### 2. Token Count Accuracy

**Problem**: Token estimation uses `length / 4` heuristic (not precise for embedding models).

**DIY Fix**:  
Install `tiktoken` (OpenAI's tokenizer library) and recalculate tokens per chunk:

```python
import tiktoken
import json

enc = tiktoken.encoding_for_model("gpt-4")

with open("RAGNATOR_PART_001.ndjson", "r") as f:
    for line in f:
        chunk = json.loads(line)
        chunk["tokens"] = len(enc.encode(chunk["content"]))
        print(json.dumps(chunk))
```

***

### 3. Semantic Chunking (instead of fixed-size)

**Problem**: Chunks cut mid-sentence or mid-argument, losing context.

**DIY Fix**:  
Use sentence embeddings to detect semantic boundaries. Example with `sentence-transformers`:

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer('all-MiniLM-L6-v2')
sentences = [...]  # your sentences from PDF

embeddings = model.encode(sentences)
similarities = [np.dot(embeddings[i], embeddings[i+1]) for i in range(len(embeddings)-1)]

# Split where similarity drops below threshold
chunk_breaks = [i for i, sim in enumerate(similarities) if sim < 0.7]
```

***

### 4. Deduplication (headers, footers, repeated content)

**Problem**: PDFs often have repeated headers/footers on every page.

**DIY Fix**:  
Run a simple deduplication pass with cosine similarity between chunks. If two chunks are >95% similar, keep only one:

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

chunks = [...]  # your chunk texts
vectorizer = TfidfVectorizer()
tfidf = vectorizer.fit_transform(chunks)
sim_matrix = cosine_similarity(tfidf)

# Flag duplicates
duplicates = [(i, j) for i in range(len(sim_matrix)) for j in range(i+1, len(sim_matrix)) if sim_matrix[i][j] > 0.95]
```

***

## Use Cases

- 📚 **Research**: consolidate papers/books for literature review and Q&A
- ⚖️ **Legal**: case law, contracts, regulatory documents
- 🎓 **Education**: textbooks → interactive Q&A systems
- 🏢 **Enterprise**: manuals, wikis, internal knowledge bases

***

## Tech Stack

- **React** (UI framework)
- **pdf.js** (PDF text extraction)
- **JSZip** (bundle packaging and compression)
- **Tailwind CSS + Lucide Icons** (styling)

***

## Why This Tool Exists

I built Ragnator to solve a personal problem: **315 PDFs (2GB) for a research project** that I needed queryable in Perplexity. Direct upload was slow and unstructured. This tool gave me traceability, repeatability, and control.

If you're building RAG systems, knowledge bases, or AI research tools, you know: **ingest quality defines answer quality**. Ragnator handles the unglamorous work of turning "pile of files" into "structured dataset."

***

## Contributing

This tool is **feature-complete for my use case**, but PRs are welcome if you want to add:
- DOCX/Markdown support
- Web worker parallelization (process multiple files simultaneously)
- Integration with vector DB APIs (Pinecone, Weaviate, etc.)
- Unit tests for chunking logic

***

## License

MIT — use it, fork it, ship it, sell it. No strings attached.

***

**Built by [Guilherme Thompson](https://linkedin.com/in/g-thompson-ops) | [Portfolio](https://guilherme-thompson.ghost.io)**  
*Revenue Operations + AI-Augmented Development*

***

## FAQ

**Q: Can I use this for scanned PDFs?**  
A: Only if they have an embedded text layer. If the PDF is pure image (no OCR), you'll need to pre-process with tools like Adobe Acrobat, Tesseract OCR, or cloud OCR APIs.

**Q: Why not use [existing tool X]?**  
A: Most PDF converters don't preserve page metadata, don't enforce size limits, or require backend services. Ragnator runs in your browser and gives you full control over chunking logic.

**Q: Can I customize chunk size/overlap?**  
A: Yes. Edit the constants at the top of `RAGNATOR_v3_NDJSON.jsx`:
```javascript
const CHUNK_TARGET_SIZE = 1500;  // adjust as needed
const CHUNK_OVERLAP = 200;       // adjust overlap
```

**Q: Is there a hosted version?**  
A: No. This runs 100% client-side for privacy. Just copy-paste the code into AI Studio/Gemini Canvas (easiest) or clone the repo.

**Q: Will you add feature X?**  
A: Probably not — this tool does what I need. But the code is MIT-licensed, so fork away! The "DIY Fix" section above covers the most common enhancement requests.
