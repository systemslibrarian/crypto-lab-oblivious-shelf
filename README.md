[![crypto-lab portfolio](https://img.shields.io/badge/crypto--lab-portfolio-blue?style=flat-square)](https://systemslibrarian.github.io/crypto-lab/)
[![Deploy to GitHub Pages](https://github.com/systemslibrarian/crypto-lab-oblivious-shelf/actions/workflows/pages.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-oblivious-shelf/actions/workflows/pages.yml)

# crypto-lab-oblivious-shelf

## 1. What It Is

crypto-lab-oblivious-shelf implements the 2-server Information-Theoretic Private Information Retrieval (IT-PIR) scheme from Chor, Goldreich, Kushilevitz, and Sudan (1995). A patron retrieves an entry from a 16-item library catalog by sending XOR-based queries to two non-colluding servers, neither of which learns which entry was requested. The security model is information-theoretic: the server provably learns nothing regardless of its computational power, requiring no cryptographic hardness assumptions. This demo connects library patron privacy ethics directly to a concrete mathematical primitive.

## 2. When to Use It

- Use IT-PIR when patrons must retrieve catalog records without the server logging which record was accessed, and legal or policy protections alone are insufficient.
- Use it when you need privacy guarantees that hold even if the adversary has unlimited computation — computational PIR is not sufficient.
- Use it in multi-server deployments (e.g. mirrored library systems) where servers are genuinely operated independently.
- Do not use it as the sole privacy measure — IT-PIR protects the query, not the physical borrowing transaction, the IP address, or query timing.
- Do not use the 2-server scheme when both servers are operated by the same institution — collusion collapses the guarantee immediately.

## 3. Live Demo

[https://systemslibrarian.github.io/crypto-lab-oblivious-shelf/](https://systemslibrarian.github.io/crypto-lab-oblivious-shelf/)

Select any book from the 16-entry catalog, click "Generate Query," and step through the full 2-server XOR PIR protocol with real arithmetic. The privacy audit panel shows exactly what each server sees, demonstrating that neither server's view reveals the target index.

## 4. What Can Go Wrong

- **Server collusion:** if both servers share logs or are controlled by the same party, the guarantee fails — the scheme provides no protection against a colluding pair.
- **Query linkage:** repeated queries from the same IP for the same item are not protected by PIR alone; traffic analysis can correlate queries over time.
- **O(n) communication:** for a catalog of 1 million items, each query requires transmitting 1 million bits to each server — impractical without the engineering optimizations in systems like RAID-PIR.
- **Implementation bugs in subset generation:** if the random subset S is not uniformly distributed, the privacy proof breaks. Use a cryptographically secure PRNG.
- **Metadata leakage:** PIR protects the index, not the fact that a query occurred, its timing, its size, or the patron's identity.

## 5. Real-World Usage

- **RAID-PIR (2014):** a practical IT-PIR system using RAID-style XOR distribution, designed for databases of millions of records.
- **Percy++ (Ian Goldberg, University of Waterloo):** an open-source IT-PIR and CPIR library used in academic and privacy research deployments.
- **ALA privacy guidelines:** the American Library Association has cited cryptographic privacy techniques including PIR as technical complements to legal patron privacy protections.
- **Tor hidden services:** while not PIR, Tor's onion routing addresses the same adversarial model (server learns nothing about requester) at the network layer.
- **Microsoft SEAL:** a computational PIR adjacent system using homomorphic encryption for single-server keyword search without IT-PIR's communication cost.

**Cross-links:**
- [Patron Shield](https://systemslibrarian.github.io/crypto-lab-patron-shield/) — IT-PIR applied to full catalog privacy
- [Silent Tally](https://systemslibrarian.github.io/crypto-lab-silent-tally/) — Shamir-based MPC secure sum
- [Shamir Gate](https://systemslibrarian.github.io/crypto-lab-shamir-gate/) — threshold secret sharing
- [crypto-lab home](https://systemslibrarian.github.io/crypto-lab/)

---

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
