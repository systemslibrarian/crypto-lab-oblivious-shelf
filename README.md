# crypto-lab-oblivious-shelf

## What It Is

crypto-lab-oblivious-shelf implements the basic 2-server XOR Information-Theoretic Private Information Retrieval (IT-PIR) construction from Chor, Goldreich, Kushilevitz, and Sudan (1995), plus a bounded robust-PIR companion. A patron chooses one of 16 books, but either protocol retrieves only that book's one-bit checked-out flag, not its title or full catalog record. The original lesson sends a uniformly random subset to one server and that subset with the target toggled to the other. Robust Shelf instead uses five replicated servers and degree-one unit-vector shares over GF(8), so any two honest answers reconstruct and wrong or missing answers are correctable exactly within `2b + u <= 3`; one query recipient learns nothing about the index, while any two can recover it. Both lessons are one-round browser teaching models whose guarantees require the assumptions stated on the page; they are not deployed private retrieval services.

## When to Use It

- Use this lab to study how two correlated XOR queries recover one database bit while either protocol query alone hides its target.
- Use IT-PIR designs when the required non-collusion, identical-database, randomness, and network-metadata assumptions can be enforced and audited.
- Use information-theoretic PIR when privacy must not depend on a computational hardness assumption.
- Do not use PIR as the sole privacy measure — it hides the requested index within its protocol model, not the physical borrowing transaction, patron identity, IP address, or query timing.
- Do not use the 2-server scheme when both servers are operated by the same institution — collusion collapses the guarantee immediately.
- Do NOT treat this as production infrastructure — it is a browser teaching demo with simulated servers, not a deployed PIR service.

## Live Demo

**[systemslibrarian.github.io/crypto-lab-oblivious-shelf](https://systemslibrarian.github.io/crypto-lab-oblivious-shelf/)**

Select any book from the 16-entry catalog grid to set it as the target index, then click **Generate Query** to run the full 2-server XOR PIR protocol with real arithmetic. Each step — random subset generation, symmetric difference, server-side XOR computation, and client-side recovery — is displayed sequentially in the walkthrough panel. Click **Run Again** to draw another independent subset S; a repeat is possible, although unlikely for this 16-bit example. The privacy audit panel shows the protocol query each simulated server sees and derives which targets remain consistent with that view. It does not model transport metadata, server collusion, or auxiliary logs.

The **Robust Shelf** section reuses the selected book and the exact same 16-bit database snapshot. It generates all five 16-symbol GF(8) queries with Web Crypto, computes every server's real field dot product, and decodes only the replies that arrived. Presets and per-server controls make replicas unavailable, add a chosen nonzero answer delta, or flip a stale replica's target bit before its dot product. The decoder sees transmitted points only — never the fault labels or direct database bit — and the page compares an accepted value with the retained catalog bit only afterward. A separate collusion control derives all 16 candidate targets from one query view or interpolates the one-hot vector from two.

## Robust Shelf Model

- **Profile:** five full replicas, evaluation points `1..5`, GF(8) represented in the polynomial basis for `z^3 + z + 1`, degree-one query and answer polynomials, one-round queries sent before availability is known.
- **Privacy:** each coordinate of one server's query is uniform because `r -> s + r*omega` is a bijection for nonzero `omega`; two distinct query views interpolate every constant and reveal the one-hot target.
- **Availability and faults:** with `u` erasures and `b` wrong replies, the punctured dimension-two Reed–Solomon word is uniquely decodable when `5-u >= 2+2b`, equivalently `2b+u <= 3`.
- **Exceeded threshold:** no fail-closed promise exists. The included `b=2, u=1` run constructs a wrong line with three agreements, and the decoder accepts the wrong bit while the page labels the guarantee exceeded first.
- **Adaptation boundary:** this is the linear unit-vector/Shamir warmup combined with bounded Reed–Solomon answer decoding. It is not Beimel–Stahl Theorem 5.2's sublinear cube construction, Goldberg's full 2007 protocol, Percy++, RAID-PIR, or a production implementation.

## What Can Go Wrong

- **Server collusion:** if both servers share logs or are controlled by the same party, the guarantee fails — the scheme provides no protection against a colluding pair.
- **Dishonest or stale robust replicas:** Robust Shelf corrects only within `2b + u <= 3`. A server's self-reported digest would not authenticate its answer, and enough replicas agreeing on stale or false data can make the client accept it.
- **Query linkage:** repeated queries from the same IP for the same item are not protected by PIR alone; traffic analysis can correlate queries over time.
- **O(n) communication in the basic XOR scheme:** the construction this demo runs sends an n-bit subset indicator to each server, so a catalog of 1 million items costs 1 million bits per server per query. This is a property of the simplest scheme, not of 2-server IT-PIR in general — Chor et al.'s same paper gives a 2-server scheme with O(n^(1/3)) communication — but practical deployment still needs the engineering in systems like RAID-PIR.
- **Implementation bugs in subset generation:** if the random subset S is not uniformly distributed, the privacy proof breaks. Use a cryptographically secure PRNG.
- **Metadata leakage:** PIR protects the index, not the fact that a query occurred, its timing, its size, or the patron's identity.

## Research Systems and Prototypes

- **[RAID-PIR](https://encrypto.de/papers/DHS14.pdf) (Demmler, Herzberg, and Schneider, 2014):** A multi-server PIR design that combines pseudorandomly expanded queries with RAID-inspired striping, mirroring, and parity techniques to reduce storage and communication costs.
- **[Percy++](https://crysp.uwaterloo.ca/software/) (University of Waterloo):** An open-source C++ library implementing information-theoretic and computational PIR protocols for research and experimentation.
- **[PIR-Tor](https://www.usenix.org/conference/usenix-security-11/pir-tor-scalable-anonymous-communication-using-private-information) (Mittal et al., 2011):** A Tor-directory design that evaluates both computational and information-theoretic PIR architectures for privately retrieving relay information.
- **[Popcorn](https://www.usenix.org/system/files/conference/nsdi16/nsdi16-paper-gupta-trinabh-update.pdf) (Gupta et al., 2016):** A video-delivery prototype that composes information-theoretic and computational PIR components rather than relying on IT-PIR alone.
- **[Checklist](https://www.usenix.org/conference/usenixsecurity21/presentation/kogan) (Kogan and Corrigan-Gibbs, 2021):** A two-server, offline/online PIR system for private blocklist lookups, evaluated with Safe Browsing data.

## Primary References

- [Chor, Goldreich, Kushilevitz, and Sudan, *Private Information Retrieval*](https://madhu.seas.harvard.edu/papers/1995/pir-journ.pdf)
- [Beimel and Stahl, *Robust Information-Theoretic Private Information Retrieval*](https://www.cs.bgu.ac.il/~beimel/Papers/BS_Journal.pdf) — §§2.2, 2.3.1, 5–6; the exact robust definitions, vector Shamir sharing, unit-vector warmup, and Byzantine/decoding boundary used by the companion lesson.
- [Goldberg, *Improving the Robustness of Private Information Retrieval*](https://crysp.uwaterloo.ca/courses/pet/F09/cache/www.cypherpunks.ca/~iang/pubs/robustpir.pdf) — §§1–3; unavailable, incorrect, and colluding-server distinctions plus polynomial answer reconstruction. Stronger extensions in the paper are not claimed here.
- [Shamir, *How to Share a Secret*](https://dl.acm.org/doi/10.1145/359168.359176) — the polynomial-sharing foundation.
- [Wehner and de Wolf, *Improved Lower Bounds for Locally Decodable Codes and Private Information Retrieval*](https://arxiv.org/abs/quant-ph/0403140)
- [Dvir and Gopi, *2-Server PIR with Sub-polynomial Communication*](https://arxiv.org/abs/1407.6692)
- [United States Code, 50 U.S.C. § 1861](https://www.govinfo.gov/link/uscode/50/1861)
- [United States Code, 18 U.S.C. § 2709](https://www.govinfo.gov/link/uscode/18/2709)
- [American Library Association guidance on law-enforcement inquiries](https://www.ala.org/advocacy/privacy/lawenforcement/inquiries)

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-oblivious-shelf
cd crypto-lab-oblivious-shelf
npm install
npm run dev
```

Verification commands:

```bash
npm test
npm run build
npm run test:a11y
npm run test:mutations
```

The unit suite pins the full GF(8) tables and exact fixture, exhaustively checks every slope vector on a reduced database and every two-server pair, enumerates erasure patterns and nonzero single-answer corruptions, and proves the stale and exceeded-bound paths from actual computations. Browser claims independently recompute the displayed field dot products, decoder candidates, collusion result and communication figures. The accessibility drive opens the new result states at desktop, 380-pixel and 320-pixel widths. The mutation gate begins from an unmodified passing browser/unit baseline, applies concrete source changes one at a time, requires each named owner test to turn red, restores the file exactly and finishes with a clean build.

## Related Demos

- [crypto-lab-patron-shield](https://systemslibrarian.github.io/crypto-lab-patron-shield/) — IT-PIR applied to full catalog privacy, with a collusion-attack toggle.
- [crypto-lab-oram-vault](https://systemslibrarian.github.io/crypto-lab-oram-vault/) — Path ORAM hides access patterns rather than a single query index.
- [crypto-lab-psi-gate](https://systemslibrarian.github.io/crypto-lab-psi-gate/) — private set intersection for contact discovery.
- [crypto-lab-silent-tally](https://systemslibrarian.github.io/crypto-lab-silent-tally/) — Shamir-based MPC secure sum.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
