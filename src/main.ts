import './style.css';
import { CATALOG, DB_SIZE } from './catalog.ts';
import {
  pirQuery,
  generateDatabase,
  formatSet,
  buildXorChain,
} from './pir.ts';

// ---------- Database: generated once per session ----------
const DB: boolean[] = generateDatabase(DB_SIZE);

// ---------- State ----------
let selectedIndex: number | null = null;
let isRunning = false;

// ---------- Build HTML ----------
document.querySelector<HTMLDivElement>('#app')!.innerHTML = buildHTML();

// ---------- Wire up interactions ----------
initThemeToggle();
initCatalogCards();
initQueryPanel();

// ================================================================
// HTML BUILDER
// ================================================================
function buildHTML(): string {
  return `
    ${buildHeader()}
    <nav class="section-nav" aria-label="Page sections">
      <a href="#section-a">A: What is IT-PIR?</a>
      <a href="#section-b">B: Live Demo</a>
      <a href="#section-c">C: Communication Cost</a>
      <a href="#section-d">D: Librarian's Dilemma</a>
    </nav>
    ${buildSectionA()}
    <hr class="section-divider" />
    ${buildSectionB()}
    <hr class="section-divider" />
    ${buildSectionC()}
    <hr class="section-divider" />
    ${buildSectionD()}
    ${buildFooter()}
  `;
}

// ================================================================
// HEADER
// ================================================================
function buildHeader(): string {
  return `
    <header class="site-header" id="top">
      <button class="theme-toggle" id="theme-toggle" aria-label="Switch to light mode" title="Toggle theme">🌙</button>
      <p class="breadcrumb">
        <a href="https://systemslibrarian.github.io/crypto-lab/">← crypto-lab portfolio</a>
      </p>
      <h1>Oblivious Shelf</h1>
      <p class="subtitle">Information-Theoretic Private Information Retrieval — Chor, Goldreich, Kushilevitz &amp; Sudan (1995)</p>
    </header>
  `;
}

// ================================================================
// SECTION A: What is IT-PIR?
// ================================================================
function buildSectionA(): string {
  return `
    <section class="demo-section" id="section-a" aria-labelledby="section-a-heading">
      <p class="section-label">Section A</p>
      <h2 id="section-a-heading">What is IT-PIR?</h2>

      <div class="subsection" id="section-a1">
        <h3>A1 — The Library Privacy Problem</h3>
        <p>
          Suppose a patron wants to retrieve a record from a library catalog of 16 books.
          The simplest approach is to ask the server directly — but the server then learns
          exactly which book was requested, creating a permanent log entry.
        </p>

        <div class="pir-visual" aria-label="Single-server diagram showing privacy leak">
          <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.75rem;text-align:center;">
            Single-server setup — the server learns which book you want
          </p>
          <div class="pir-diagram">
            <div class="pir-node patron">
              <div class="node-label">Patron</div>
              wants book #9
            </div>
            <div class="pir-arrow danger">
              <span>Which book?</span>
              <div class="arrow-line"></div>
              <span style="font-size:0.65rem">query</span>
            </div>
            <div class="pir-node server" style="border-color:var(--error)">
              <div class="node-label">Library Server</div>
              📚 db[0..15]
              <div style="margin-top:0.35rem;font-size:0.7rem;color:var(--error)">
                ✗ I now know you<br>wanted book #9
              </div>
            </div>
            <div class="pir-arrow danger" style="transform:scaleX(-1)">
              <span style="transform:scaleX(-1)">Here it is</span>
              <div class="arrow-line"></div>
              <span style="transform:scaleX(-1);font-size:0.65rem">response</span>
            </div>
          </div>
        </div>

        <p>
          IT-PIR solves this by splitting the query across two <em>non-colluding</em>
          servers, each holding identical copies of the database. The patron's query
          is constructed so that neither server alone can determine which book was
          requested — even with unlimited computational power.
        </p>

        <div class="pir-visual" aria-label="Two-server PIR diagram showing privacy preservation">
          <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.75rem;text-align:center;">
            IT-PIR setup — two non-colluding servers, neither learns the target
          </p>
          <div class="pir-diagram">
            <div class="pir-node patron">
              <div class="node-label">Patron</div>
              wants book #9
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem">
              <div class="pir-arrow safe-a">
                <span>Query S</span>
                <div class="arrow-line"></div>
              </div>
              <div class="pir-arrow safe-b">
                <span>Query S△{9}</span>
                <div class="arrow-line"></div>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem">
              <div class="pir-node server-a">
                <div class="node-label">Server A</div>
                📚 db[0..15]
                <div style="margin-top:0.35rem;font-size:0.7rem;color:var(--success)">
                  ✓ Sees only S<br>(random-looking)
                </div>
              </div>
              <div class="pir-node server-b">
                <div class="node-label">Server B</div>
                📚 db[0..15]
                <div style="margin-top:0.35rem;font-size:0.7rem;color:var(--warning)">
                  ✓ Sees only S△{9}<br>(random-looking)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="subsection" id="section-a2">
        <h3>A2 — Why Two Servers?</h3>
        <p>
          With a <strong>single server</strong>, information-theoretic privacy is impossible
          if you download less than the full database. Any query that fetches fewer than
          <em>n</em> items must reveal something about which item you want — otherwise the
          server could not distinguish your query from one targeting a different item, and
          it would have to return every item. This is a fundamental lower bound established
          in Chor et al. (1995).
        </p>

        <div class="explainer-box">
          <strong>Lower bound:</strong> For a database of <em>n</em> bits, any 1-server PIR
          scheme achieving information-theoretic privacy requires the client to download the
          entire database: <em>Ω(n)</em> bits. No non-trivial 1-server IT-PIR exists.
        </div>

        <p>
          With <strong>two non-colluding servers</strong>, the lower bound is bypassed.
          The key insight: the patron can hide the target index <em>i</em> inside a random
          set <em>S</em>, so that each server's query looks uniformly random — carrying
          zero information about <em>i</em>.
        </p>

        <div class="explainer-box privacy">
          <strong>Two-server IT-PIR guarantee:</strong> Each server's view is a uniformly
          random subset of <code>{0, …, n−1}</code>. The view is statistically independent
          of the target index <em>i</em>. No server, operating alone, can distinguish
          whether the patron wanted book #2, #9, or any other entry.
        </div>
      </div>

      <div class="subsection" id="section-a3">
        <h3>A3 — The XOR Scheme (Chor et al. 1995)</h3>
        <p>
          The simplest and most elegant IT-PIR construction uses XOR over a boolean database.
          Each database entry is a single bit: <code>db[j] ∈ {0, 1}</code>. Here we use
          availability status (checked out = 1, available = 0), though the same arithmetic
          applies to any bit-level data.
        </p>

        <ol class="protocol-steps" aria-label="Protocol steps">
          <li class="protocol-step">
            <strong>Choose target index.</strong>
            The patron selects <span class="step-code">i ∈ {0, …, 15}</span> — the book
            they want to retrieve.
          </li>
          <li class="protocol-step">
            <strong>Generate random subset.</strong>
            The patron samples a uniformly random subset
            <span class="step-code">S ⊆ {0, …, 15}</span>
            using a cryptographically secure PRNG. Each element of
            <span class="step-code">{0,…,15}</span> is independently included with
            probability 1/2.
          </li>
          <li class="protocol-step">
            <strong>Query Server A.</strong>
            Send the set <span class="step-code">S</span> to Server A.
          </li>
          <li class="protocol-step">
            <strong>Query Server B.</strong>
            Send <span class="step-code">S △ {i}</span> (symmetric difference — toggle
            whether <em>i</em> is in the set) to Server B.
          </li>
          <li class="protocol-step">
            <strong>Server A responds.</strong>
            Server A computes and returns:
            <span class="step-code">r<sub>A</sub> = ⊕<sub>j∈S</sub> db[j]</span>
          </li>
          <li class="protocol-step">
            <strong>Server B responds.</strong>
            Server B computes and returns:
            <span class="step-code">r<sub>B</sub> = ⊕<sub>j∈S△{i}</sub> db[j]</span>
          </li>
          <li class="protocol-step">
            <strong>Patron recovers.</strong>
            <span class="step-code">r<sub>A</sub> ⊕ r<sub>B</sub> = db[i]</span>
          </li>
        </ol>

        <div class="explainer-box" style="margin-top:1.25rem">
          <strong>Why it works:</strong>
          <ul style="margin:0.5rem 0 0 1.2rem;line-height:1.8">
            <li>If <code>i ∈ S</code>: then <code>S △ {i} = S \ {i}</code>.
              Server A's XOR includes <code>db[i]</code>; Server B's does not.
              So <code>r<sub>A</sub> ⊕ r<sub>B</sub> = db[i]</code>. ✓</li>
            <li>If <code>i ∉ S</code>: then <code>S △ {i} = S ∪ {i}</code>.
              Server A's XOR does not include <code>db[i]</code>; Server B's does.
              So <code>r<sub>A</sub> ⊕ r<sub>B</sub> = db[i]</code>. ✓</li>
          </ul>
          In both cases, XOR-ing the two responses cancels all shared terms and isolates
          exactly <code>db[i]</code>.
        </div>

        <div class="explainer-box privacy" style="margin-top:0.75rem">
          <strong>Why it's private:</strong>
          Server A sees only <code>S</code>, which is uniformly random over all subsets
          of <code>{0,…,15}</code> — its distribution is independent of <em>i</em>.
          Server B sees only <code>S △ {i}</code>: toggling a fixed element in a uniformly
          random set again yields a uniformly random set, independent of which element was
          toggled. <em>Each server's view has zero mutual information with the target index.</em>
        </div>
      </div>
    </section>
  `;
}

// ================================================================
// SECTION B: Live PIR Query Demo
// ================================================================
function buildSectionB(): string {
  const catalogCards = CATALOG.map((entry) => {
    const avail = DB[entry.id];
    const badgeClass = avail ? 'checked-out' : 'available';
    const badgeText = avail ? 'Checked out' : 'Available';
    return `
      <div class="catalog-card" data-index="${entry.id}" role="button" tabindex="0"
           aria-label="Book ${entry.id}: ${entry.title} by ${entry.author}. ${badgeText}.">
        <span class="card-index">#${entry.id}</span>
        <div class="card-title">${entry.title}</div>
        <div class="card-author">${entry.author}</div>
        <div class="card-callnum">${entry.callNumber}</div>
        <span class="availability-badge ${badgeClass}">${badgeText}</span>
      </div>
    `;
  }).join('');

  return `
    <section class="demo-section" id="section-b" aria-labelledby="section-b-heading">
      <p class="section-label">Section B</p>
      <h2 id="section-b-heading">Live PIR Query Demo</h2>
      <p>
        Select any book from the catalog, then click <strong>Generate Query</strong> to
        run the full 2-server XOR PIR protocol with real arithmetic. Each query uses a
        freshly sampled random subset S — click <strong>Run Again</strong> to see a
        different subset retrieve the same book.
      </p>

      <div class="demo-layout">
        <!-- Left: catalog -->
        <div>
          <h3 style="margin-bottom:0.75rem;font-size:0.9rem">
            16-Book Catalog — click to select target
          </h3>
          <div class="catalog-grid" id="catalog-grid" role="listbox" aria-label="Book catalog">
            ${catalogCards}
          </div>
        </div>

        <!-- Right: query panel -->
        <div class="query-panel" id="query-panel">
          <h3>Query Walkthrough</h3>

          <div class="selected-display" id="selected-display">
            <div class="sel-none">No book selected — click a card on the left</div>
          </div>

          <div class="query-controls">
            <button class="btn btn-primary" id="btn-generate" disabled>Generate Query</button>
            <button class="btn" id="btn-again" disabled>Run Again</button>
          </div>

          <div class="walkthrough" id="walkthrough" aria-live="polite" aria-label="Step-by-step protocol walkthrough">
            <!-- Steps injected by JS -->
          </div>

          <div class="server-views" id="server-views" style="display:none">
            <div class="server-view-box server-a">
              <div class="sv-label">Server A's View</div>
              <div class="sv-set" id="sv-a-set">—</div>
              <div class="sv-note">Server A cannot distinguish which element of S (if any) is the target.</div>
            </div>
            <div class="server-view-box server-b">
              <div class="sv-label">Server B's View</div>
              <div class="sv-set" id="sv-b-set">—</div>
              <div class="sv-note">Server B cannot distinguish which element was toggled.</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

// ================================================================
// SECTION C: Communication Cost
// ================================================================
function buildSectionC(): string {
  return `
    <section class="demo-section" id="section-c" aria-labelledby="section-c-heading">
      <p class="section-label">Section C</p>
      <h2 id="section-c-heading">Communication Cost and Tradeoffs</h2>

      <div class="subsection">
        <h3>C1 — Communication Cost</h3>
        <p>
          For a database of <em>n</em> items, the communication complexity of each approach differs:
        </p>
        <ul style="margin:0.75rem 0 0.75rem 1.5rem;line-height:2">
          <li><strong>Naive (download everything):</strong> <code>O(n)</code> bits — trivially private but impractical.</li>
          <li><strong>2-server IT-PIR (Chor et al.):</strong> Two queries each of size <code>O(n)</code> bits (the subsets),
            plus two 1-bit responses. Total: <code>O(n)</code> bits. Same asymptotic cost as naive, but with
            information-theoretic privacy.</li>
        </ul>
        <div class="explainer-box warning">
          <strong>Fundamental inefficiency:</strong> This is the core tradeoff in IT-PIR.
          Achieving perfect, information-theoretic privacy with 2 servers requires
          <code>O(n)</code> communication. You pay the same bandwidth cost as downloading
          the full database — but the server learns nothing. Subsequent work reduced this
          cost with additional servers, but 2-server IT-PIR cannot do better than <code>O(n)</code>.
        </div>
        <p>
          Research following Chor et al. sought to improve communication cost. Woodruff and
          Yekhanin (2005) achieved <code>O(n<sup>1/3</sup>)</code> with 3 servers using
          matching vectors. Efremenko (2009) further reduced cost to sub-polynomial with a
          constant number of servers. However, all IT-PIR schemes require at least
          <code>Ω(log n / log log n)</code> communication.
        </p>
      </div>

      <div class="subsection">
        <h3>C2 — Number of Servers vs. Communication</h3>
        <div class="pir-table-wrap">
          <table class="pir-table" aria-label="Communication complexity by number of servers">
            <thead>
              <tr>
                <th scope="col">Servers</th>
                <th scope="col">Scheme</th>
                <th scope="col">Communication</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td class="impossible">Impossible (IT)</td>
                <td class="impossible">—</td>
              </tr>
              <tr class="highlight">
                <td>2</td>
                <td>Chor et al. 1995</td>
                <td><code>O(n)</code></td>
              </tr>
              <tr>
                <td>3</td>
                <td>Woodruff-Yekhanin 2005</td>
                <td><code>O(n<sup>1/3</sup>)</code></td>
              </tr>
              <tr>
                <td>k</td>
                <td>Efremenko 2009</td>
                <td>sub-polynomial</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="subsection">
        <h3>C3 — Computational PIR (CPIR)</h3>
        <p>
          Computational PIR (CPIR) achieves sub-linear communication with a
          <em>single</em> server by relying on computational hardness assumptions such as
          Learning With Errors (LWE) or the Decisional Diffie-Hellman (DDH) problem.
          A single CPIR server cannot distinguish queries targeting different indices — but
          only assuming it lacks the computational resources to break the underlying
          hardness assumption.
        </p>
        <p>
          In library contexts, IT-PIR is often preferred precisely because it requires <em>no
          such assumptions</em>. The server provably learns nothing regardless of its
          computational power. A library server compelled by a court order cannot disclose
          which book was requested, even if it retains all logs and has unlimited compute —
          the information simply was never present in the query.
        </p>
        <p>
          CPIR is attractive when only a single server is available, but the security model
          is weaker: it is only as strong as the underlying hardness assumption holds.
        </p>
      </div>

      <div class="subsection">
        <h3>C4 — Real-World Deployment</h3>
        <ul style="margin:0 0 0 1.5rem;line-height:2.2">
          <li>
            <strong>RAID-PIR (2014):</strong> A practical IT-PIR system that distributes a
            large database across multiple servers using RAID-style XOR parity, achieving
            efficient bandwidth usage for millions of entries.
          </li>
          <li>
            <strong>Percy++:</strong> An open-source IT-PIR and CPIR library from Ian Goldberg
            at the University of Waterloo, used extensively in academic and privacy
            research deployments.
          </li>
          <li>
            <strong>Microsoft SEAL:</strong> A homomorphic encryption library from Microsoft
            Research supporting BFV and CKKS schemes, used for single-server CPIR-adjacent
            keyword search without IT-PIR's communication overhead.
          </li>
        </ul>
      </div>
    </section>
  `;
}

// ================================================================
// SECTION D: The Librarian's Dilemma
// ================================================================
function buildSectionD(): string {
  return `
    <section class="demo-section" id="section-d" aria-labelledby="section-d-heading">
      <p class="section-label">Section D</p>
      <h2 id="section-d-heading">The Librarian's Dilemma</h2>

      <div class="subsection">
        <h3>D1 — The Legal Landscape</h3>
        <p>
          The USA PATRIOT Act (2001), Section 215, authorized federal law enforcement to
          compel disclosure of library circulation records and patron databases via a
          National Security Letter, accompanied by a gag order prohibiting the library from
          notifying the patron or the public. Librarians who received such orders were legally
          barred from disclosing their existence.
        </p>
        <p>
          The American Library Association responded with formal policy guidance reaffirming
          patron privacy as a core professional value, challenged the constitutionality of
          gag orders in court, and encouraged libraries to minimize data retention. Several
          states — including Connecticut, Illinois, and California — have enacted library
          privacy statutes that impose stricter limits on government access than federal law.
          The tension between patron privacy and government access remains legally and
          politically unresolved.
        </p>
        <p>
          Cryptographic PIR offers a technical complement to these legal protections. If a
          library deploys IT-PIR for catalog access, its servers retain only random-looking
          query subsets: sets of indices with no connection to any patron's identity or intent.
          Even if a court order compels full disclosure of server logs, <em>no information
          about which patron requested which item exists to disclose</em>. The database knows
          it was queried; it does not know what for.
        </p>
      </div>

      <div class="subsection">
        <h3>D2 — Where IT-PIR Fits</h3>
        <div style="overflow-x:auto">
          <table class="comparison-table" aria-label="Privacy approach comparison">
            <thead>
              <tr>
                <th scope="col">Approach</th>
                <th scope="col">Privacy model</th>
                <th scope="col">Limits</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Legal protection</strong></td>
                <td>Policy-based</td>
                <td>Overridable by court order; relies on institutional compliance</td>
              </tr>
              <tr>
                <td><strong>Anonymization</strong></td>
                <td>Heuristic</td>
                <td>Subject to re-identification attacks; not formally proven</td>
              </tr>
              <tr>
                <td><strong>IT-PIR</strong></td>
                <td>Information-theoretic</td>
                <td>Requires 2 genuinely non-colluding servers; O(n) communication</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="subsection">
        <h3>D3 — Honest Limitations</h3>
        <ul class="limitations-list" aria-label="Honest limitations of IT-PIR">
          <li>
            <strong>Query only, not borrowing.</strong> IT-PIR protects the catalog lookup.
            It does not protect the physical act of borrowing a book, requesting an
            interlibrary loan, or checking out a physical item — those transactions leave
            records by necessity.
          </li>
          <li>
            <strong>Non-collusion is a real assumption.</strong> If both servers are operated
            by the same institution, share infrastructure, or are jointly subpoenaed, the
            guarantee collapses immediately. The scheme requires genuinely independent
            and adversarially separated servers.
          </li>
          <li>
            <strong>O(n) communication is expensive.</strong> For a catalog of one million
            entries, each query requires transmitting one million bits to each server.
            Practical deployment at scale requires systems engineering (e.g., RAID-PIR)
            beyond this basic scheme.
          </li>
          <li>
            <strong>Metadata is not protected.</strong> IT-PIR hides the queried index, not
            the fact that a query occurred, its timing, its frequency, the patron's IP
            address, or traffic patterns. Traffic analysis can correlate repeated queries
            from the same network over time.
          </li>
        </ul>
      </div>
    </section>
  `;
}

// ================================================================
// FOOTER
// ================================================================
function buildFooter(): string {
  return `
    <footer class="site-footer">
      <p class="scripture">
        "So whether you eat or drink or whatever you do, do it all for the glory of God."
        — 1 Corinthians 10:31
      </p>
      <p class="back-link">
        Part of the <a href="https://systemslibrarian.github.io/crypto-lab/">crypto-lab portfolio</a> ·
        <a href="https://systemslibrarian.github.io/crypto-lab-patron-shield/">Patron Shield</a> ·
        <a href="https://systemslibrarian.github.io/crypto-lab-silent-tally/">Silent Tally</a> ·
        <a href="https://systemslibrarian.github.io/crypto-lab-shamir-gate/">Shamir Gate</a>
      </p>
    </footer>
  `;
}

// ================================================================
// THEME TOGGLE
// ================================================================
function initThemeToggle(): void {
  const btn = document.getElementById('theme-toggle') as HTMLButtonElement;
  if (!btn) return;

  function applyTheme(theme: string): void {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      btn.textContent = '🌙';
      btn.setAttribute('aria-label', 'Switch to light mode');
    } else {
      btn.textContent = '☀️';
      btn.setAttribute('aria-label', 'Switch to dark mode');
    }
  }

  // Sync button with current theme (set by anti-flash script)
  const currentTheme = document.documentElement.getAttribute('data-theme') ?? 'dark';
  applyTheme(currentTheme);

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

// ================================================================
// CATALOG CARD INTERACTIONS
// ================================================================
function initCatalogCards(): void {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  function selectCard(index: number): void {
    selectedIndex = index;

    // Update card highlights
    grid!.querySelectorAll('.catalog-card').forEach((card) => {
      card.classList.remove('selected');
      card.setAttribute('aria-selected', 'false');
    });
    const target = grid!.querySelector<HTMLElement>(`.catalog-card[data-index="${index}"]`);
    if (target) {
      target.classList.add('selected');
      target.setAttribute('aria-selected', 'true');
    }

    // Update selected display
    const entry = CATALOG[index];
    const display = document.getElementById('selected-display');
    if (display) {
      display.innerHTML = `
        <div class="sel-info">
          <strong>#${index}</strong> — ${entry.title}
          <span style="color:var(--text-muted)"> by ${entry.author}</span>
          <code style="margin-left:0.5rem;font-size:0.75rem">${entry.callNumber}</code>
        </div>
      `;
    }

    // Enable buttons
    const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
    const btnAgain = document.getElementById('btn-again') as HTMLButtonElement;
    if (btnGenerate) btnGenerate.disabled = false;
    if (btnAgain) btnAgain.disabled = false;

    // Clear previous walkthrough
    clearWalkthrough();
  }

  grid.addEventListener('click', (e) => {
    const card = (e.target as HTMLElement).closest<HTMLElement>('.catalog-card');
    if (card) {
      const idx = parseInt(card.dataset.index ?? '-1', 10);
      if (idx >= 0) selectCard(idx);
    }
  });

  grid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.catalog-card');
      if (card) {
        e.preventDefault();
        const idx = parseInt(card.dataset.index ?? '-1', 10);
        if (idx >= 0) selectCard(idx);
      }
    }
  });
}

// ================================================================
// QUERY PANEL
// ================================================================
function initQueryPanel(): void {
  const btnGenerate = document.getElementById('btn-generate') as HTMLButtonElement;
  const btnAgain = document.getElementById('btn-again') as HTMLButtonElement;

  btnGenerate?.addEventListener('click', () => {
    if (selectedIndex !== null && !isRunning) runQuery(selectedIndex);
  });

  btnAgain?.addEventListener('click', () => {
    if (selectedIndex !== null && !isRunning) runQuery(selectedIndex);
  });
}

function clearWalkthrough(): void {
  const wt = document.getElementById('walkthrough');
  if (wt) wt.innerHTML = '';
  const sv = document.getElementById('server-views');
  if (sv) sv.style.display = 'none';
}

function runQuery(targetIndex: number): void {
  isRunning = true;
  clearWalkthrough();

  const result = pirQuery(DB, targetIndex);
  const entry = CATALOG[targetIndex];

  const steps: Array<{ title: string; body: string; className?: string }> = [
    {
      title: 'Step 1 — Target selected',
      body: `You want book #${targetIndex} — "${entry.title}" by ${entry.author}`,
      className: 'result',
    },
    {
      title: 'Step 2 — Random subset S generated',
      body: `S = ${formatSet(result.subsetS)}  (|S| = ${result.subsetS.size})`,
    },
    {
      title: 'Step 3 — Query to Server A',
      body: `Sending set S = ${formatSet(result.subsetS)}`,
    },
    {
      title: 'Step 4 — Query to Server B',
      body: `Sending set S △ {${targetIndex}} = ${formatSet(result.subsetS2)}`,
    },
    {
      title: 'Step 5 — Server A computes',
      body: buildXorChain(DB, result.subsetS),
      className: 'xor-chain',
    },
    {
      title: 'Step 6 — Server B computes',
      body: buildXorChain(DB, result.subsetS2),
      className: 'xor-chain',
    },
    {
      title: 'Step 7 — Patron recovers db[' + targetIndex + ']',
      body: buildRecoveryLine(result, targetIndex),
      className: 'result',
    },
    {
      title: 'Step 8 — Privacy proof',
      body: buildPrivacyProof(result, targetIndex),
      className: 'privacy-note',
    },
  ];

  const walkthrough = document.getElementById('walkthrough')!;

  steps.forEach((step, i) => {
    setTimeout(() => {
      const div = document.createElement('div');
      div.className = `walk-step${step.className ? ' ' + step.className : ''}`;
      div.innerHTML = `
        <div class="step-title">${escapeHtml(step.title)}</div>
        <div class="step-body">${escapeHtml(step.body)}</div>
      `;
      walkthrough.appendChild(div);
      // Trigger animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          div.classList.add('visible');
        });
      });

      // Last step: show server views
      if (i === steps.length - 1) {
        updateServerViews(result);
        isRunning = false;
      }
    }, i * 380);
  });
}

function buildRecoveryLine(result: ReturnType<typeof pirQuery>, idx: number): string {
  const ra = result.responseA ? '1' : '0';
  const rb = result.responseB ? '1' : '0';
  const rec = result.recovered ? '1' : '0';
  const label = result.recovered ? 'Checked out' : 'Available';
  return `responseA(${ra}) ⊕ responseB(${rb}) = db[${idx}] = ${rec} → ${label}`;
}

function buildPrivacyProof(result: ReturnType<typeof pirQuery>, idx: number): string {
  const sStr = formatSet(result.subsetS);
  const s2Str = formatSet(result.subsetS2);
  return (
    `Server A saw S = ${sStr}. ` +
    `Is this set random? Yes — every subset is equally likely regardless of target #${idx}. ` +
    `Does it reveal that book #${idx} was wanted? No.\n` +
    `Server B saw S△{${idx}} = ${s2Str}. ` +
    `Also uniformly random. Also reveals nothing about #${idx}.`
  );
}

function updateServerViews(result: ReturnType<typeof pirQuery>): void {
  const sv = document.getElementById('server-views')!;
  sv.style.display = 'grid';

  const svASet = document.getElementById('sv-a-set')!;
  const svBSet = document.getElementById('sv-b-set')!;

  svASet.textContent = `S = ${formatSet(result.subsetS)}`;
  svBSet.textContent = `S△{i} = ${formatSet(result.subsetS2)}`;
}

// ================================================================
// UTILITY
// ================================================================
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}
