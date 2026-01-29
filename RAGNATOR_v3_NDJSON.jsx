import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, Database, Download, Terminal, AlertCircle, CheckCircle, Loader2, Cpu, Trash2, BookOpen, Package, FileJson, Sparkles } from 'lucide-react';

/**
 * RAGNATOR v3.2 - ENTERPRISE EDITION
 * * Senior Updates:
 * 1. RICH NDJSON SCHEMA: Generates structured data (id, tokens, page, source) compatible with Perplexity/Vector DBs.
 * 2. SMART PAGE TRACKING: StreamProcessor now tracks page numbers from PDF signals.
 * 3. ZIP ORGANIZATION: Outputs a professional folder structure with metadata manifest.
 * 4. STRICT SIZE LIMIT: 38.5MB limit enforced via byte counting.
 */

const MAX_BUNDLE_SIZE = 38.5 * 1024 * 1024; // 38.5MB Strict Limit
const CHUNK_TARGET_SIZE = 1500;
const CHUNK_OVERLAP = 200;

// Internal state management class for the streaming process
class StreamProcessor {
  constructor(filename, onChunkEmitted) {
    this.filename = filename;
    this.buffer = ""; 
    this.lastPageSeen = 1; // Track page number
    this.onChunkEmitted = onChunkEmitted;
  }

  processText(text) {
    // Check for page markers before normalizing
    const pageMatch = text.match(/\[PAGE_END:(\d+)\]/);
    if (pageMatch) {
      this.lastPageSeen = parseInt(pageMatch[1], 10);
    }

    // Normalize logic
    const cleanSegment = text
      .replace(/\[PAGE_END:\d+\]/g, "") // Remove markers from content
      .replace(/[\r\n]+/g, "\n")
      .replace(/[ \t]+/g, ' ')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
    
    this.buffer += cleanSegment;

    while (this.buffer.length >= CHUNK_TARGET_SIZE + 200) {
      this._cutChunk();
    }
  }

  flush() {
    while (this.buffer.length > 0) {
      this._cutChunk(true);
    }
  }

  _cutChunk(isFinal = false) {
    if (this.buffer.length === 0) return;

    let end = Math.min(CHUNK_TARGET_SIZE, this.buffer.length);
    
    // Smart split logic
    if (!isFinal && end < this.buffer.length) {
      const lookWindow = this.buffer.slice(end - 100, end + 100);
      const match = lookWindow.match(/[.!?]\s/); 
      if (match && match.index !== undefined) {
         end = (end - 100) + match.index + 1;
      } else {
         const newlineMatch = lookWindow.match(/\n/);
         if (newlineMatch && newlineMatch.index !== undefined) {
            end = (end - 100) + newlineMatch.index;
         }
      }
    }

    if (end <= 0) end = CHUNK_TARGET_SIZE;

    const chunkContent = this.buffer.slice(0, end).trim();
    
    if (chunkContent.length > 20) {
      this.onChunkEmitted(chunkContent, this.filename, this.lastPageSeen);
    }

    if (isFinal) {
      this.buffer = "";
    } else {
      this.buffer = this.buffer.slice(end - CHUNK_OVERLAP);
    }
  }
}

export default function Ragnator() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [outputFormat, setOutputFormat] = useState('txt'); // 'txt' | 'ndjson'
  const [logs, setLogs] = useState([]);
  const [progress, setProgress] = useState({ current: 0, total: 0, filename: '', percent: 0 });
  const [bundles, setBundles] = useState([]);
  const [systemReady, setSystemReady] = useState(false);
  const logEndRef = useRef(null);

  const encoder = useRef(new TextEncoder());
  const currentBundle = useRef({ id: 1, content: "", size: 0, chunkCount: 0 });
  const finalBundles = useRef([]);

  useEffect(() => {
    const init = async () => {
      try {
        if (window.pdfjsLib) { setSystemReady(true); return; }
        
        const pdfJsVer = '3.11.174';
        const scriptMain = document.createElement('script');
        scriptMain.src = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJsVer}/pdf.min.js`;
        const scriptZip = document.createElement('script');
        scriptZip.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

        await Promise.all([
          new Promise((resolve) => { scriptMain.onload = resolve; document.head.appendChild(scriptMain); }),
          new Promise((resolve) => { scriptZip.onload = resolve; document.head.appendChild(scriptZip); })
        ]);

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfJsVer}/pdf.worker.min.js`;
        setSystemReady(true);
        addLog('SYSTEM', 'RAGNATOR v3.2 Enterprise Engine Online.');
      } catch (e) {
        addLog('CRITICAL', 'Failed to load dependencies.');
      }
    };
    init();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (type, message) => {
    setLogs(prev => {
        const newLogs = [...prev, { type, message, time: new Date().toLocaleTimeString() }];
        return newLogs.slice(-100);
    });
  };

  const handleFiles = (e) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'pending'
    }));
    setFiles(prev => [...prev, ...newFiles]);
    addLog('INFO', `Queued ${newFiles.length} files.`);
  };

  // --- ENGINE CORE ---

  const formatChunk = (text, filename, page, format) => {
    if (format === 'ndjson') {
      // Enterprise NDJSON Schema
      return JSON.stringify({
        id: `chunk_${Math.random().toString(36).substr(2, 9)}`,
        source: filename,
        page: page,
        content: text,
        tokens: Math.round(text.length / 4), // Rough token estimation
        created_at: new Date().toISOString()
      }) + "\n";
    } else {
      // Classic Enriched Text
      return `[METADATA: Source="${filename}" | Page=${page}]\n---\n${text}\n---\n\n`;
    }
  };

  const appendToBundle = (rawText, filename, page, format) => {
    const formattedText = formatChunk(rawText, filename, page, format);
    const len = encoder.current.encode(formattedText).length;
    
    if (currentBundle.current.size + len > MAX_BUNDLE_SIZE) {
      const ext = format === 'ndjson' ? 'ndjson' : 'txt';
      finalBundles.current.push({
        name: `RAGNATOR_PART_${String(currentBundle.current.id).padStart(3, '0')}.${ext}`,
        content: currentBundle.current.content,
        chunks: currentBundle.current.chunkCount
      });
      addLog('SYSTEM', `📦 Bundle #${currentBundle.current.id} Sealed (${(currentBundle.current.size/1024/1024).toFixed(2)}MB).`);
      
      currentBundle.current = {
        id: currentBundle.current.id + 1,
        content: formattedText,
        size: len,
        chunkCount: 1
      };
      
      setBundles([...finalBundles.current]);
    } else {
      currentBundle.current.content += formattedText;
      currentBundle.current.size += len;
      currentBundle.current.chunkCount++;
    }
  };

  const runPipeline = async (targetFormat) => {
    if (processing) return;
    setProcessing(true);
    setOutputFormat(targetFormat);
    finalBundles.current = [];
    currentBundle.current = { id: 1, content: "", size: 0, chunkCount: 0 };
    setBundles([]);
    
    addLog('START', `Initializing Pipeline (Mode: ${targetFormat.toUpperCase()})...`);

    const queue = files.filter(f => f.status === 'pending');
    
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing' } : f));
      setProgress({ current: i + 1, total: queue.length, filename: item.file.name, percent: 0 });

      try {
        const stream = new StreamProcessor(item.file.name, (chunk, fname, pg) => {
           appendToBundle(chunk, fname, pg, targetFormat);
        });

        if (item.file.type === 'application/pdf' || item.file.name.endsWith('.pdf')) {
          await processPDF(item.file, stream, (pct) => setProgress(p => ({ ...p, percent: pct })));
        } else {
          const text = await extractOtherText(item.file);
          stream.processText(text);
        }

        stream.flush();
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'done' } : f));
        addLog('SUCCESS', `Finished: ${item.file.name}`);

      } catch (err) {
        console.error(err);
        setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error' } : f));
        addLog('ERROR', `${item.file.name}: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, 20));
    }

    if (currentBundle.current.content.length > 0) {
      const ext = targetFormat === 'ndjson' ? 'ndjson' : 'txt';
      finalBundles.current.push({
        name: `RAGNATOR_PART_${String(currentBundle.current.id).padStart(3, '0')}.${ext}`,
        content: currentBundle.current.content,
        chunks: currentBundle.current.chunkCount
      });
      setBundles([...finalBundles.current]);
    }

    setProcessing(false);
    addLog('COMPLETE', 'Pipeline Finished.');
  };

  // --- EXTRACTORS ---

  const processPDF = async (file, streamProcessor, onProgress) => {
    const buffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument(buffer).promise;
    const total = pdf.numPages;
    
    for (let i = 1; i <= total; i++) {
      let page = null;
      try {
        page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(item => item.str);
        // Inject marker for page tracking
        const pageText = strings.join(' ') + ` [PAGE_END:${i}]\n`;
        
        streamProcessor.processText(pageText);

        if (i % 5 === 0) onProgress(Math.round((i / total) * 100));
      } catch (e) {
        console.warn(`Page ${i} error`, e);
      } finally {
        if (page) page.cleanup();
      }
      if (i % 10 === 0) await new Promise(r => setTimeout(r, 1));
    }
    if (pdf) pdf.destroy();
  };

  const extractOtherText = async (file) => {
     if (file.name.endsWith('.epub')) {
        const zip = await window.JSZip.loadAsync(file);
        let t = "";
        const files = [];
        zip.forEach((path, entry) => {
            if (entry.name.match(/\.(html|xhtml|xml)$/)) files.push(entry);
        });
        for (const f of files) {
            const raw = await f.async('string');
            const doc = new DOMParser().parseFromString(raw, 'text/html');
            t += (doc.body?.textContent || "") + "\n";
        }
        return t;
     }
     return "Format not supported";
  };

  const downloadAll = async () => {
    if (bundles.length === 0) return;
    const zip = new window.JSZip();
    
    // Enterprise Folder Structure
    const rootFolder = zip.folder(`RAGNATOR_DATASET_${new Date().toISOString().slice(0,10)}`);
    const dataFolder = rootFolder.folder(outputFormat === 'ndjson' ? 'NDJSON' : 'TEXT_CHUNKS');
    
    let totalSize = 0;
    
    bundles.forEach(b => {
        dataFolder.file(b.name, b.content);
        totalSize += new Blob([b.content]).size;
    });

    // Metadata Manifest
    const manifest = {
        dataset_name: "RAGNATOR_EXPORT",
        created_at: new Date().toISOString(),
        format: outputFormat,
        total_files: bundles.length,
        total_size_bytes: totalSize,
        total_chunks_approx: bundles.reduce((acc, b) => acc + (b.chunks || 0), 0),
        generated_by: "Ragnator v3.2 Enterprise"
    };
    
    rootFolder.file("dataset_summary.json", JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RAGNATOR_${outputFormat.toUpperCase()}_DATASET.zip`;
    a.click();
  };

  if (!systemReady) {
      return (
          <div className="min-h-screen bg-black flex items-center justify-center text-white flex-col gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-red-600" />
              <p className="font-mono text-sm tracking-widest uppercase">Booting Ragnator Enterprise...</p>
          </div>
      );
  }

  return (
    <div className="h-screen bg-slate-950 text-slate-200 font-sans flex flex-col overflow-hidden">
      
      {/* Top Bar */}
      <div className="h-16 border-b border-red-900/30 bg-slate-900 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
            <div className="bg-red-600 p-1.5 rounded"><Cpu className="text-black w-5 h-5"/></div>
            <h1 className="font-black text-xl tracking-tight text-white">RAGNATOR <span className="text-red-500 text-xs">v3.2 ENT</span></h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span className="text-green-500">SYSTEM ONLINE</span>
            </div>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left: Input */}
        <div className="w-1/3 border-r border-slate-800 bg-slate-950 flex flex-col p-4 gap-4">
            
            <div className="relative group h-40 shrink-0">
                <input type="file" multiple accept=".pdf,.epub" onChange={handleFiles} disabled={processing} className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer disabled:cursor-not-allowed"/>
                <div className={`h-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-2 transition-all ${processing ? 'border-slate-800 opacity-50' : 'border-slate-700 group-hover:border-red-500 group-hover:bg-red-500/5'}`}>
                    <Upload className="text-slate-500 group-hover:text-red-500 transition-colors" />
                    <span className="text-xs font-mono uppercase text-slate-500">Drop Files Here</span>
                </div>
            </div>

            <div className="flex flex-col gap-3 shrink-0">
                {/* Standard Process */}
                <button 
                  onClick={() => runPipeline('txt')} 
                  disabled={processing || files.length === 0} 
                  className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold py-3 rounded flex items-center justify-center gap-2 uppercase text-sm tracking-wider transition-all"
                >
                    {processing && outputFormat === 'txt' ? <Loader2 className="animate-spin w-4 h-4"/> : <FileText className="w-4 h-4 text-slate-400"/>}
                    {processing && outputFormat === 'txt' ? 'Processing...' : 'Create Standard TXT'}
                </button>
                
                {/* NDJSON Process (Yellow Button) */}
                <button 
                  onClick={() => runPipeline('ndjson')} 
                  disabled={processing || files.length === 0} 
                  className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-bold py-3 rounded flex items-center justify-center gap-2 uppercase text-sm tracking-wider transition-all shadow-[0_0_15px_rgba(234,179,8,0.3)]"
                >
                    {processing && outputFormat === 'ndjson' ? <Loader2 className="animate-spin w-4 h-4"/> : <Sparkles className="w-4 h-4 text-black"/>}
                    {processing && outputFormat === 'ndjson' ? 'Generating...' : 'Create NDJSON (Perplexity)'}
                </button>

                <div className="flex justify-end">
                  <button onClick={() => setFiles([])} disabled={processing} className="px-4 py-2 bg-slate-900 border border-slate-800 hover:border-red-500 rounded text-slate-400 hover:text-red-500 transition-all flex items-center gap-2 text-xs uppercase"><Trash2 className="w-3 h-3"/> Clear</button>
                </div>
            </div>

            <div className="flex-1 bg-slate-900/50 rounded border border-slate-800 overflow-hidden flex flex-col">
                <div className="p-2 border-b border-slate-800 bg-slate-900 text-xs font-mono text-slate-500 flex justify-between">
                    <span>QUEUE ({files.length})</span>
                    <span>{files.filter(f => f.status === 'done').length} DONE</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {files.map(f => (
                        <div key={f.id} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800/50 text-xs">
                            <span className="truncate max-w-[200px] text-slate-300">{f.file.name}</span>
                            {f.status === 'pending' && <span className="w-2 h-2 rounded-full bg-slate-600"/>}
                            {f.status === 'processing' && <Loader2 className="w-3 h-3 text-yellow-500 animate-spin"/>}
                            {f.status === 'done' && <CheckCircle className="w-3 h-3 text-green-500"/>}
                            {f.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500"/>}
                        </div>
                    ))}
                </div>
            </div>

        </div>

        {/* Right: Monitoring */}
        <div className="flex-1 bg-black flex flex-col relative">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #333 1px, transparent 0)', backgroundSize: '20px 20px' }}></div>

            {/* Progress Strip */}
            {processing && (
                <div className="h-1 bg-slate-900 w-full">
                    <div className="h-full bg-red-600 transition-all duration-300 shadow-[0_0_10px_red]" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
                </div>
            )}

            {/* Terminal */}
            <div className="h-1/2 p-4 flex flex-col border-b border-slate-800 relative z-10">
                <div className="flex items-center gap-2 mb-2 text-slate-500 text-xs font-mono">
                    <Terminal className="w-3 h-3" />
                    <span>KERNEL LOG</span>
                </div>
                <div className="flex-1 bg-slate-950/80 border border-slate-800 rounded p-3 overflow-y-auto font-mono text-xs space-y-1 scrollbar-none">
                    {logs.map((l, i) => (
                        <div key={i} className={`${l.type === 'ERROR' ? 'text-red-500' : l.type === 'SUCCESS' ? 'text-green-500' : l.type === 'START' || l.type === 'COMPLETE' ? 'text-purple-400 font-bold' : 'text-slate-400'}`}>
                            <span className="opacity-30 mr-2">{l.time}</span>
                            <span className="mr-2">[{l.type}]</span>
                            {l.message}
                        </div>
                    ))}
                    <div ref={logEndRef}></div>
                </div>
            </div>

            {/* Output */}
            <div className="flex-1 p-4 bg-slate-900/30 flex flex-col relative z-10">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h2 className="text-white font-bold">Generated Artifacts</h2>
                        <p className="text-xs text-slate-500">
                          {bundles.length > 0 ? `Ready for RAG ingestion (${outputFormat.toUpperCase()})` : 'Waiting for input...'}
                        </p>
                    </div>
                    <button onClick={downloadAll} disabled={bundles.length === 0} className="bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2 px-4 rounded text-sm flex items-center gap-2 transition-all">
                        <Download className="w-4 h-4"/> Download All ({bundles.length})
                    </button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto flex-1 content-start">
                    {bundles.map((b, i) => (
                        <div key={i} className={`bg-slate-900 border ${outputFormat === 'ndjson' ? 'border-yellow-900/50' : 'border-slate-700'} p-3 rounded flex flex-col gap-2 hover:border-green-500/50 transition-colors group`}>
                            <div className="flex items-center gap-2 text-slate-300 font-mono text-xs truncate">
                                {outputFormat === 'ndjson' ? <FileJson className="w-3 h-3 text-yellow-500" /> : <Package className="w-3 h-3 text-red-500" />}
                                <span className="truncate">{b.name}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <div className="text-[10px] text-slate-500 uppercase tracking-widest">
                                    {(new Blob([b.content]).size / 1024 / 1024).toFixed(2)} MB
                                </div>
                                {outputFormat === 'ndjson' && b.chunks && (
                                    <div className="text-[10px] text-yellow-600 font-mono">
                                        {b.chunks} chunks
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {bundles.length === 0 && !processing && (
                        <div className="col-span-full h-20 flex items-center justify-center text-slate-600 text-xs font-mono border border-dashed border-slate-800 rounded">
                            NO ARTIFACTS GENERATED YET
                        </div>
                    )}
                </div>
            </div>

        </div>
      </div>
    </div>
  );
}