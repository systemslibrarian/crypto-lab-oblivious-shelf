import { CATALOG } from './catalog.ts';
import {
  colludeRobustQueries,
  robustCommunicationCost,
  runRobustPlan,
  runRobustScenario,
  singleServerCandidateTargets,
  type RobustFaultScenario,
  type RobustScenarioResult,
  type ServerFaultKind,
  type ServerFaultPlan,
} from './robust-pir.ts';

type SelectedIndex = () => number | null;

const PRESETS: ReadonlyArray<{ value: RobustFaultScenario; label: string }> = [
  { value: 'honest', label: 'All five answers honest' },
  { value: 'one-erasure', label: 'One unavailable server' },
  { value: 'three-erasures', label: 'Three unavailable servers' },
  { value: 'one-byzantine', label: 'One altered answer' },
  { value: 'one-byzantine-one-erasure', label: 'One altered + one unavailable' },
  { value: 'stale-replica', label: 'One stale replica' },
  { value: 'beyond-bound', label: 'Exceeded bound: wrong answer accepted' },
  { value: 'custom', label: 'Custom server controls' },
];

const SIMPLE_PRESET_CONTROLS: Partial<
  Record<RobustFaultScenario, ReadonlyArray<{ kind: ServerFaultKind; delta?: number }>>
> = {
  honest: Array.from({ length: 5 }, () => ({ kind: 'honest' as const })),
  'one-erasure': [
    { kind: 'honest' }, { kind: 'honest' }, { kind: 'honest' }, { kind: 'honest' },
    { kind: 'unavailable' },
  ],
  'three-erasures': [
    { kind: 'honest' }, { kind: 'honest' }, { kind: 'unavailable' },
    { kind: 'unavailable' }, { kind: 'unavailable' },
  ],
  'one-byzantine': [
    { kind: 'honest' }, { kind: 'honest' }, { kind: 'corrupt', delta: 1 },
    { kind: 'honest' }, { kind: 'honest' },
  ],
  'one-byzantine-one-erasure': [
    { kind: 'honest' }, { kind: 'honest' }, { kind: 'corrupt', delta: 1 },
    { kind: 'honest' }, { kind: 'unavailable' },
  ],
  'stale-replica': [
    { kind: 'stale' }, { kind: 'honest' }, { kind: 'honest' },
    { kind: 'honest' }, { kind: 'honest' },
  ],
  'beyond-bound': [
    { kind: 'corrupt', delta: 1 }, { kind: 'corrupt', delta: 1 },
    { kind: 'honest' }, { kind: 'honest' }, { kind: 'unavailable' },
  ],
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function controlRows(): string {
  return Array.from({ length: 5 }, (_, index) => {
    const serverId = index + 1;
    return `
      <div class="robust-server-control" data-control-server="${serverId}">
        <strong>Server ${serverId}</strong>
        <span class="robust-point">ω<sub>${serverId}</sub> = ${serverId}</span>
        <label for="robust-kind-${serverId}">Reply behavior</label>
        <select id="robust-kind-${serverId}" data-robust-kind="${serverId}">
          <option value="honest">Honest</option>
          <option value="unavailable">Unavailable</option>
          <option value="corrupt">Alter answer</option>
          <option value="stale">Stale target bit</option>
        </select>
        <label for="robust-delta-${serverId}">GF(8) XOR delta</label>
        <select id="robust-delta-${serverId}" data-robust-delta="${serverId}" disabled>
          ${Array.from({ length: 7 }, (_, delta) =>
            `<option value="${delta + 1}">${delta + 1}</option>`
          ).join('')}
        </select>
      </div>
    `;
  }).join('');
}

export function buildRobustSection(databaseLength: number): string {
  const costs = robustCommunicationCost(databaseLength);
  return `
    <section class="demo-section" id="section-e" aria-labelledby="section-e-heading">
      <p class="section-label">Section E</p>
      <h2 id="section-e-heading">Robust Shelf: missing and dishonest servers</h2>
      <p>
        The two-server XOR lesson needs both answers and cannot correct a lie. This bounded
        companion shares the same one-hot query as independent degree-one polynomials over
        <strong>GF(8)</strong>, evaluated by five replicated servers at points 1 through 5.
        Any one query is independent of the requested index; any two query recipients can
        interpolate the one-hot vector and reveal it.
      </p>
      <div class="explainer-box privacy">
        <strong>Declared model:</strong> 1-private, 2-out-of-5 replicated PIR; field
        <code>GF(2³) = GF(2)[z]/(z³+z+1)</code>. Honest answers lie on one line
        <code>A(Y)=x[i]+λY</code>. After <em>u</em> erasures and <em>b</em> wrong replies,
        unique correction is guaranteed exactly when <code>2b+u ≤ 3</code>.
      </div>

      <div class="robust-workbench">
        <div class="robust-controls" aria-labelledby="robust-controls-heading">
          <h3 id="robust-controls-heading">Run one round</h3>
          <p id="robust-target" class="selected-display">Select a book in Section B first.</p>

          <label for="robust-preset">Fault preset</label>
          <select id="robust-preset">
            ${PRESETS.map(({ value, label }) =>
              `<option value="${value}">${escapeHtml(label)}</option>`
            ).join('')}
          </select>

          <fieldset class="robust-control-fieldset">
            <legend>Server replies</legend>
            <p class="hint">Unavailable servers send no point. Altered answers add the selected nonzero field delta. A stale server flips its own target bit before taking the actual dot product.</p>
            <div class="robust-server-control-grid">${controlRows()}</div>
          </fieldset>

          <fieldset class="robust-control-fieldset">
            <legend>Query recipients that collude</legend>
            <div class="robust-collusion-controls">
              <label for="robust-colluder-a">First view</label>
              <select id="robust-colluder-a">
                ${Array.from({ length: 5 }, (_, i) => `<option value="${i + 1}">Server ${i + 1}</option>`).join('')}
              </select>
              <label for="robust-colluder-b">Second view</label>
              <select id="robust-colluder-b">
                <option value="0">None — one-server view only</option>
                ${Array.from({ length: 5 }, (_, i) => `<option value="${i + 1}">Server ${i + 1}</option>`).join('')}
              </select>
            </div>
          </fieldset>

          <button class="btn btn-primary" id="btn-robust-run" disabled>Run robust query</button>
          <p class="hint">Queries go to all five servers before availability is known. Answer faults and query collusion are evaluated separately.</p>
        </div>

        <div class="robust-output-shell">
          <div id="robust-awaiting" class="robust-awaiting">
            <strong>No robust transcript yet</strong>
            <p>Select a book, choose the server behavior, and run the real field arithmetic.</p>
          </div>
          <div id="robust-result" hidden></div>
          <div id="robust-status" class="sr-only" role="status" aria-live="polite"></div>
        </div>
      </div>

      <div class="subsection robust-cost-section">
        <h3>E2 — What the extra replicas cost</h3>
        <p>These are algebraic payload bits for this ${databaseLength}-bit database, excluding HTTP, TLS, framing and JavaScript object overhead. No concrete byte codec is claimed.</p>
        <div class="pir-table-wrap" role="region" tabindex="0" aria-label="PIR payload comparison">
          <table class="pir-table" id="robust-cost-table">
            <thead><tr><th scope="col">Measure</th><th scope="col">Two-server XOR</th><th scope="col">Robust GF(8)</th></tr></thead>
            <tbody>
              <tr><th scope="row">Database replicas</th><td data-cost="baseline-replicas">${costs.baseline.replicas}</td><td data-cost="robust-replicas">${costs.robust.replicas}</td></tr>
              <tr><th scope="row">Query per server</th><td data-cost="baseline-query-per">${costs.baseline.queryBitsPerServer} bits</td><td data-cost="robust-query-per">${costs.robust.queryBitsPerServer} bits</td></tr>
              <tr><th scope="row">All queries</th><td data-cost="baseline-query-total">${costs.baseline.totalQueryBits} bits</td><td data-cost="robust-query-total">${costs.robust.totalQueryBits} bits</td></tr>
              <tr><th scope="row">Full replies</th><td data-cost="baseline-replies">${costs.baseline.fullReplyBits} bits</td><td data-cost="robust-replies">${costs.robust.fullReplyBits} bits</td></tr>
              <tr><th scope="row">Full algebraic payload</th><td data-cost="baseline-total">${costs.baseline.totalBits} bits</td><td data-cost="robust-total">${costs.robust.totalBits} bits</td></tr>
              <tr><th scope="row">Honest replies required</th><td>both 2</td><td>any 2</td></tr>
              <tr><th scope="row">Private against</th><td>one server</td><td>one server</td></tr>
              <tr><th scope="row">Two query views collude</th><td>target revealed</td><td>target revealed</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="subsection">
        <h3>E3 — Exact boundary of the lesson</h3>
        <ul class="limitations-list">
          <li><strong>Privacy, availability and answer correctness are different properties.</strong> Correcting a bad answer does not undo query collusion, and hiding a target does not authenticate a reply.</li>
          <li><strong>Agreement is not provenance.</strong> There is no signature, MAC, external database commitment or freshness proof. Enough replicas agreeing on stale data can return stale data.</li>
          <li><strong>The threshold is a guarantee, not a detector.</strong> Beyond <code>2b+u ≤ 3</code>, this decoder may refuse, recover by luck, or accept a wrong line; the pinned exceeded-bound preset demonstrates the last outcome.</li>
          <li><strong>This is the linear unit-vector/Shamir warmup.</strong> It is a bounded teaching adaptation of Beimel–Stahl's sharing and Reed–Solomon robustness principles, not their sublinear Theorem 5.2 construction, Goldberg's full 2007 protocol, Percy++ or production PIR.</li>
          <li><strong>Operational metadata remains visible.</strong> The server count, catalog size, query occurrence, timing, source address and client identity are outside this protocol.</li>
        </ul>
        <p class="source-note">
          Primary sources: <a href="https://www.cs.bgu.ac.il/~beimel/Papers/BS_Journal.pdf">Beimel and Stahl, §§2.2, 2.3.1, 5–6</a>;
          <a href="https://crysp.uwaterloo.ca/courses/pet/F09/cache/www.cypherpunks.ca/~iang/pubs/robustpir.pdf">Goldberg 2007, §§1–3</a>;
          <a href="https://dl.acm.org/doi/10.1145/359168.359176">Shamir 1979</a>.
        </p>
      </div>
    </section>
  `;
}

function getKindSelect(serverId: number): HTMLSelectElement {
  return document.getElementById(`robust-kind-${serverId}`) as HTMLSelectElement;
}

function getDeltaSelect(serverId: number): HTMLSelectElement {
  return document.getElementById(`robust-delta-${serverId}`) as HTMLSelectElement;
}

function setControl(serverId: number, kind: ServerFaultKind, delta = 1): void {
  const kindSelect = getKindSelect(serverId);
  const deltaSelect = getDeltaSelect(serverId);
  kindSelect.value = kind;
  deltaSelect.value = String(delta || 1);
  deltaSelect.disabled = kind !== 'corrupt';
}

function applyPresetControls(preset: RobustFaultScenario): void {
  const plan = SIMPLE_PRESET_CONTROLS[preset];
  if (!plan) return;
  plan.forEach(({ kind, delta }, index) => setControl(index + 1, kind, delta));
}

function readCustomPlan(): ServerFaultPlan[] {
  return Array.from({ length: 5 }, (_, index) => {
    const serverId = index + 1;
    const kind = getKindSelect(serverId).value as ServerFaultKind;
    if (kind === 'corrupt') {
      return { serverId, kind, delta: Number(getDeltaSelect(serverId).value) };
    }
    return { serverId, kind };
  });
}

function syncControlsFromResult(result: RobustScenarioResult): void {
  for (const reply of result.replies) {
    const kind: ServerFaultKind =
      reply.state === 'corrupted' ? 'corrupt' : reply.state;
    setControl(reply.serverId, kind, reply.delta ?? 1);
  }
}

function syncColluderOptions(): void {
  const first = document.getElementById('robust-colluder-a') as HTMLSelectElement;
  const second = document.getElementById('robust-colluder-b') as HTMLSelectElement;
  for (const option of Array.from(second.options)) {
    option.disabled = option.value !== '0' && option.value === first.value;
  }
  if (second.value === first.value) second.value = '0';
}

function renderCandidateRows(result: RobustScenarioResult): string {
  if (result.decode.candidates.length === 0) {
    return '<p>No candidate line exists until at least two replies arrive.</p>';
  }
  return `
    <div class="pir-table-wrap" role="region" tabindex="0" aria-label="Decoder candidate lines">
      <table class="pir-table robust-candidate-table">
        <thead><tr><th scope="col">A(0)</th><th scope="col">Slope</th><th scope="col">Agrees</th><th scope="col">Server IDs</th></tr></thead>
        <tbody>${result.decode.candidates.map((candidate) => `
          <tr data-candidate="${candidate.constant}:${candidate.slope}" data-agreement="${candidate.agreement}">
            <td>${candidate.constant}</td><td>${candidate.slope}</td>
            <td>${candidate.agreement} / ${result.decode.receivedCount}</td>
            <td>${candidate.agreeingServerIds.map((id) => `S${id}`).join(', ')}</td>
          </tr>
        `).join('')}</tbody>
      </table>
    </div>
  `;
}

function decoderOutcome(result: RobustScenarioResult): string {
  const { decode } = result;
  if (decode.status === 'accepted' && decode.accepted) {
    const match = result.acceptedMatchesDirect;
    return `
      <p><strong>Decoder accepted:</strong> <code>A(0) = ${decode.accepted.constant}</code>,
        from the line <code>${decode.accepted.constant} + ${decode.accepted.slope}Y</code>
        with ${decode.accepted.agreement} agreements.</p>
      <p class="${match ? 'robust-match' : 'robust-mismatch'}" data-independent-match="${String(match)}">
        Independent check after decoding: accepted bit ${match ? 'matches' : 'DOES NOT MATCH'}
        the retained catalog bit <strong>${result.transcript.directBit}</strong>.
      </p>
    `;
  }
  const message = decode.status === 'insufficient'
    ? 'Decoder refused: fewer than two replies arrived.'
    : decode.status === 'ambiguous'
      ? 'Decoder refused: more than one line met the acceptance threshold.'
      : 'Decoder refused: no line met the unique-decoding threshold.';
  return `<p data-independent-match="none"><strong>${message}</strong> No database bit was substituted for the missing result.</p>`;
}

function renderServerRows(result: RobustScenarioResult): string {
  return result.replies.map((reply) => {
    const wire = reply.transmittedAnswer === null ? 'no reply' : String(reply.transmittedAnswer);
    const delta = reply.delta === null ? '—' : String(reply.delta);
    return `
      <tr data-server-result="${reply.serverId}" data-state="${reply.state}"
          data-point="${reply.point}" data-honest-answer="${reply.answer}"
          data-transmitted-answer="${reply.transmittedAnswer ?? ''}" data-delta="${reply.delta ?? ''}">
        <th scope="row">S${reply.serverId}</th>
        <td>${reply.point}</td>
        <td>${reply.state}</td>
        <td>
          <details>
            <summary>Show ${reply.vector.length}-symbol query</summary>
            <code class="robust-query-vector" data-query-server="${reply.serverId}">${reply.vector.join(' ')}</code>
          </details>
        </td>
        <td>${reply.answer}</td>
        <td>${wire}</td>
        <td>${delta}</td>
      </tr>
    `;
  }).join('');
}

function renderPrivacy(result: RobustScenarioResult): string {
  const firstId = Number((document.getElementById('robust-colluder-a') as HTMLSelectElement).value);
  const secondId = Number((document.getElementById('robust-colluder-b') as HTMLSelectElement).value);
  const first = result.transcript.servers[firstId - 1];
  const candidates = singleServerCandidateTargets(first);
  const oneView = `
    <p data-one-view-server="${firstId}" data-one-view-candidates="${candidates.join(',')}">
      <strong>One query view (S${firstId}):</strong> ${candidates.length} of
      ${result.transcript.database.length} targets survive after deriving a legal slope vector for each candidate.
    </p>
  `;
  if (secondId === 0) {
    return `${oneView}<p><strong>Privacy verdict:</strong> one recipient does not recover the target in this model.</p>`;
  }
  const second = result.transcript.servers[secondId - 1];
  const collusion = colludeRobustQueries(first, second);
  return `${oneView}
    <p data-two-view-servers="${firstId},${secondId}" data-colluded-target="${collusion.targetIndex ?? ''}">
      <strong>Two query views (S${firstId} + S${secondId}):</strong> interpolated constants
      <code class="robust-colluded-vector">${collusion.constants.join(' ')}</code> form
      ${collusion.validUnitVector ? `the one-hot vector, revealing target <strong>${collusion.targetIndex}</strong>` : 'an invalid unit vector'}.
    </p>
    <p class="robust-mismatch"><strong>Privacy broken by collusion.</strong> Answer correction does not repair this disclosure.</p>`;
}

function renderResult(result: RobustScenarioResult): string {
  const entry = CATALOG[result.transcript.targetIndex];
  const guarantee = result.guaranteeMet
    ? `<strong>Within guarantee:</strong> 2b+u = ${result.thresholdScore} ≤ 3.`
    : `<strong>GUARANTEE EXCEEDED:</strong> 2b+u = ${result.thresholdScore} &gt; 3. The outcome below is empirical, not promised.`;
  return `
    <div class="robust-result-header">
      <p class="section-label">Fresh one-round transcript</p>
      <h3>#${result.transcript.targetIndex} — ${escapeHtml(entry.title)}</h3>
      <p>Database snapshot: <code id="robust-db-bits" data-bits="${result.transcript.database.map((bit) => bit ? 1 : 0).join('')}">${result.transcript.database.map((bit) => bit ? 1 : 0).join(' ')}</code></p>
      <p>Answer polynomial retained only for the omniscient teaching view: <code>A(Y) = ${result.transcript.answerLine.constant} + ${result.transcript.answerLine.slope}Y</code>.</p>
    </div>

    <div class="pir-table-wrap" role="region" tabindex="0" aria-label="Five robust PIR server transcripts">
      <table class="pir-table robust-server-table">
        <thead><tr><th scope="col">Server</th><th scope="col">ω</th><th scope="col">State</th><th scope="col">Actual query</th><th scope="col">Honest A</th><th scope="col">Wire A</th><th scope="col">δ</th></tr></thead>
        <tbody>${renderServerRows(result)}</tbody>
      </table>
    </div>

    <section class="robust-verdict" aria-labelledby="robust-decode-heading">
      <h4 id="robust-decode-heading">Answer decoding</h4>
      <p id="robust-guarantee" class="${result.guaranteeMet ? 'robust-guarantee' : 'robust-exceeded'}"
         data-guaranteed="${result.guaranteeMet}" data-u="${result.unavailableCount}"
         data-b="${result.wrongAnswerCount}" data-score="${result.thresholdScore}">
        ${guarantee} <span>Teaching view: u=${result.unavailableCount}, b=${result.wrongAnswerCount}.</span>
      </p>
      <p id="robust-decoder-parameters" data-received="${result.decode.receivedCount}"
         data-radius="${result.decode.radius}" data-threshold="${result.decode.threshold}"
         data-status="${result.decode.status}">
        Decoder input: ${result.decode.receivedCount} received points; radius
        <code>e=floor((r−2)/2)=${result.decode.radius}</code>; acceptance requires one unique line with at least
        ${result.decode.threshold} agreements. It receives no fault labels and no direct database bit.
      </p>
      ${decoderOutcome(result)}
      ${renderCandidateRows(result)}
    </section>

    <section class="robust-verdict" aria-labelledby="robust-privacy-heading">
      <h4 id="robust-privacy-heading">Query privacy — separate from answer faults</h4>
      ${renderPrivacy(result)}
    </section>
  `;
}

function announceResult(result: RobustScenarioResult): string {
  const guarantee = result.guaranteeMet ? 'Within the declared guarantee.' : 'Guarantee exceeded.';
  if (result.decode.status !== 'accepted' || !result.decode.accepted) {
    return `${guarantee} Decoder ${result.decode.status}; no bit accepted.`;
  }
  const match = result.acceptedMatchesDirect ? 'matches' : 'does not match';
  return `${guarantee} Decoder accepted bit ${result.decode.accepted.constant}, which ${match} the independent catalog bit.`;
}

export function retireRobustResult(reason: string): void {
  const result = document.getElementById('robust-result');
  const awaiting = document.getElementById('robust-awaiting');
  if (!result || !awaiting) return;
  result.hidden = true;
  result.innerHTML = '';
  awaiting.hidden = false;
  awaiting.innerHTML = `<strong>No current robust verdict</strong><p>${escapeHtml(reason)} Run again to create a transcript for the current controls.</p>`;
  const status = document.getElementById('robust-status');
  if (status) status.textContent = `Robust result retired: ${reason}`;
}

export function setRobustTarget(index: number): void {
  const entry = CATALOG[index];
  const target = document.getElementById('robust-target');
  if (target) {
    target.innerHTML = `<strong>Current target:</strong> #${index} — ${escapeHtml(entry.title)}. The protocol retrieves only its one-bit checked-out flag.`;
  }
  const button = document.getElementById('btn-robust-run') as HTMLButtonElement | null;
  if (button) button.disabled = false;
}

export function initRobustSection(database: readonly boolean[], selectedIndex: SelectedIndex): void {
  const preset = document.getElementById('robust-preset') as HTMLSelectElement;
  const run = document.getElementById('btn-robust-run') as HTMLButtonElement;
  const colluderA = document.getElementById('robust-colluder-a') as HTMLSelectElement;
  const colluderB = document.getElementById('robust-colluder-b') as HTMLSelectElement;

  applyPresetControls('honest');
  syncColluderOptions();

  preset.addEventListener('change', () => {
    applyPresetControls(preset.value as RobustFaultScenario);
    retireRobustResult('The fault preset changed.');
  });

  for (let serverId = 1; serverId <= 5; serverId += 1) {
    const kind = getKindSelect(serverId);
    const delta = getDeltaSelect(serverId);
    kind.addEventListener('change', () => {
      delta.disabled = kind.value !== 'corrupt';
      preset.value = 'custom';
      retireRobustResult(`Server ${serverId} behavior changed.`);
    });
    delta.addEventListener('change', () => {
      preset.value = 'custom';
      retireRobustResult(`Server ${serverId} corruption delta changed.`);
    });
  }

  colluderA.addEventListener('change', () => {
    syncColluderOptions();
    retireRobustResult('The selected query-recipient view changed.');
  });
  colluderB.addEventListener('change', () => {
    retireRobustResult('The selected collusion set changed.');
  });

  run.addEventListener('click', () => {
    const target = selectedIndex();
    if (target === null) return;
    const chosen = preset.value as RobustFaultScenario;
    const result = chosen === 'custom'
      ? runRobustPlan(database, target, readCustomPlan())
      : runRobustScenario(database, target, chosen);
    syncControlsFromResult(result);

    const output = document.getElementById('robust-result')!;
    const awaiting = document.getElementById('robust-awaiting')!;
    output.innerHTML = renderResult(result);
    output.hidden = false;
    awaiting.hidden = true;
    const status = document.getElementById('robust-status');
    if (status) status.textContent = announceResult(result);
  });
}
