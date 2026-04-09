export interface CatalogEntry {
  id: number;
  title: string;
  author: string;
  year: number;
  callNumber: string;
  category: 'Fiction' | 'History' | 'Science' | 'Philosophy';
}

export const CATALOG: CatalogEntry[] = [
  {
    id: 0,
    title: 'Pale Fire',
    author: 'Vladimir Nabokov',
    year: 1962,
    callNumber: 'PS3527.A15 P3',
    category: 'Fiction',
  },
  {
    id: 1,
    title: 'The Name of the Rose',
    author: 'Umberto Eco',
    year: 1980,
    callNumber: 'PQ4865.C6 N613',
    category: 'Fiction',
  },
  {
    id: 2,
    title: 'Guns, Germs, and Steel',
    author: 'Jared Diamond',
    year: 1997,
    callNumber: 'GN31.D48',
    category: 'History',
  },
  {
    id: 3,
    title: 'Meditations',
    author: 'Marcus Aurelius',
    year: 180,
    callNumber: 'B580.M4 E5',
    category: 'Philosophy',
  },
  {
    id: 4,
    title: 'The Double Helix',
    author: 'James D. Watson',
    year: 1968,
    callNumber: 'QH506.W38',
    category: 'Science',
  },
  {
    id: 5,
    title: 'One Hundred Years of Solitude',
    author: 'Gabriel García Márquez',
    year: 1967,
    callNumber: 'PQ8180.17.A73 C513',
    category: 'Fiction',
  },
  {
    id: 6,
    title: 'The Structure of Scientific Revolutions',
    author: 'Thomas S. Kuhn',
    year: 1962,
    callNumber: 'Q175.K95',
    category: 'Science',
  },
  {
    id: 7,
    title: 'A People\'s History of the United States',
    author: 'Howard Zinn',
    year: 1980,
    callNumber: 'E178.1.Z75',
    category: 'History',
  },
  {
    id: 8,
    title: 'Critique of Pure Reason',
    author: 'Immanuel Kant',
    year: 1781,
    callNumber: 'B2778.E5 S65',
    category: 'Philosophy',
  },
  {
    id: 9,
    title: 'The Selfish Gene',
    author: 'Richard Dawkins',
    year: 1976,
    callNumber: 'QH437.D38',
    category: 'Science',
  },
  {
    id: 10,
    title: 'Blood Meridian',
    author: 'Cormac McCarthy',
    year: 1985,
    callNumber: 'PS3563.C337 B58',
    category: 'Fiction',
  },
  {
    id: 11,
    title: 'The Histories',
    author: 'Herodotus',
    year: -440,
    callNumber: 'DF210.H413',
    category: 'History',
  },
  {
    id: 12,
    title: 'Being and Time',
    author: 'Martin Heidegger',
    year: 1927,
    callNumber: 'B3279.H48 S4813',
    category: 'Philosophy',
  },
  {
    id: 13,
    title: 'The Feynman Lectures on Physics',
    author: 'Richard P. Feynman',
    year: 1964,
    callNumber: 'QC23.F47',
    category: 'Science',
  },
  {
    id: 14,
    title: 'Invisible Man',
    author: 'Ralph Ellison',
    year: 1952,
    callNumber: 'PS3555.L625 I5',
    category: 'Fiction',
  },
  {
    id: 15,
    title: 'The Mediterranean',
    author: 'Fernand Braudel',
    year: 1949,
    callNumber: 'D973.B713',
    category: 'History',
  },
];

export const DB_SIZE = CATALOG.length; // 16
