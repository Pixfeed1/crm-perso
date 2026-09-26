// backend/services/ccProspectorRunner.js
//
// Lance l'analyseur Python (tools/cc_prospector) sur une LISTE de domaines (sous-commande
// `detect`), sans passer par Common Crawl. Utilisé par les signaux de domaine (AFNIC) :
// un domaine neuf est analysé comme n'importe quel site, avec les mêmes colonnes.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { csvToObjects } = require('../utils/csvParse');

// Mêmes réglages que le crawl (l'interpréteur reste hors dépôt, le script est celui du dépôt).
const PYTHON_BIN = process.env.CC_PROSPECTOR_PYTHON || '/home/jurojinn/tools/cc_prospector/venv/bin/python';
const SCRIPT = process.env.CC_PROSPECTOR_SCRIPT
  || path.join(__dirname, '..', '..', 'tools', 'cc_prospector', 'cc_prospector.py');

/**
 * Analyse une liste de domaines. Résout avec les lignes du CSV (objets bruts, valeurs
 * « oui »/« non »/texte), rejette si le process échoue.
 * @param {string[]} domains
 * @param {{ concurrency?: number, timeout?: number, onProgress?: (done:number, total:number)=>void }} opts
 */
function runDetect(domains, opts = {}) {
  const list = [...new Set(domains.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean))];
  if (list.length === 0) return Promise.resolve([]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-'));
  const input = path.join(dir, 'domains.txt');
  const output = path.join(dir, 'results.csv');
  fs.writeFileSync(input, list.join('\n') + '\n', 'utf8');
  const args = [SCRIPT, 'detect', '--input', input, '--output', output,
    '--concurrency', String(opts.concurrency || 10), '--timeout', String(opts.timeout || 10)];
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, args, { cwd: dir });
    const tail = [];
    let buf = '';
    const onLine = (line) => {
      const prog = line.match(/(\d+)\/(\d+)\s+traités/);
      if (prog && opts.onProgress) opts.onProgress(parseInt(prog[1], 10), parseInt(prog[2], 10));
    };
    // La progression (« … X/N traités ») sort sur STDERR ; le bilan final sur stdout.
    let bufErr = '';
    child.stdout.on('data', (d) => { buf += d.toString(); const lines = buf.split('\n'); buf = lines.pop(); lines.forEach(onLine); });
    child.stderr.on('data', (d) => {
      bufErr += d.toString(); const lines = bufErr.split('\n'); bufErr = lines.pop();
      lines.forEach((l) => { onLine(l); if (l.trim() && !/traités/.test(l)) { tail.push(l); if (tail.length > 8) tail.shift(); } });
    });
    const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } };
    child.on('error', (err) => { cleanup(); reject(new Error(`Analyseur introuvable (${PYTHON_BIN}) : ${err.message}`)); });
    child.on('close', (code) => {
      try {
        if (code !== 0 || !fs.existsSync(output)) return reject(new Error(tail.join('\n') || `L'analyse a échoué (code ${code}).`));
        const rows = csvToObjects(fs.readFileSync(output, 'utf8'));
        resolve(rows);
      } catch (e) {
        reject(e);
      } finally {
        cleanup();
      }
    });
  });
}

module.exports = { runDetect, PYTHON_BIN, SCRIPT };
