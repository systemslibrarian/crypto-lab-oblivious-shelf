# crypto-lab-oblivious-shelf

## What It Is

crypto-lab-oblivious-shelf implements the basic 2-server XOR Information-Theoretic Private Information Retrieval (IT-PIR) construction from Chor, Goldreich, Kushilevitz, and Sudan (1995). A patron chooses one of 16 books, but the protocol retrieves only that book's one-bit checked-out flag, not its title or full catalog record. One server receives a uniformly random subset and the other receives that subset with the target index toggled. Provided the randomness is uniform and independent, both servers hold the same database, the servers do not collude, and each server's view is limited to its protocol query, either query's distribution is statistically independent of the target index. This browser app simulates both servers for teaching; it is not a deployed private retrieval service.

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

## What Can Go Wrong

- **Server collusion:** if both servers share logs or are controlled by the same party, the guarantee fails — the scheme provides no protection against a colluding pair.
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

## Related Demos

- [crypto-lab-patron-shield](https://systemslibrarian.github.io/crypto-lab-patron-shield/) — IT-PIR applied to full catalog privacy, with a collusion-attack toggle.
- [crypto-lab-oram-vault](https://systemslibrarian.github.io/crypto-lab-oram-vault/) — Path ORAM hides access patterns rather than a single query index.
- [crypto-lab-psi-gate](https://systemslibrarian.github.io/crypto-lab-psi-gate/) — private set intersection for contact discovery.
- [crypto-lab-silent-tally](https://systemslibrarian.github.io/crypto-lab-silent-tally/) — Shamir-based MPC secure sum.

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
