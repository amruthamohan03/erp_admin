import { eq, sql } from 'drizzle-orm';
import { clientMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Ten sample DRC clients so the Clients Dashboard has data to show
// out of the box. Adapted from main's drizzle/0043_seed_clients.sql.
//
// After the main-parity restructure the identifying code lives in
// `short_name` (3 chars) and the trading name in `company_name`;
// `client_type` is a required I/E/L combination. The legacy tax_id is
// mapped onto `nif_number`.
//
// Idempotent — upserts by short_name.

interface SampleClient {
  short_name: string;
  company_name: string;
  client_type: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  nif_number: string | null;
}

const SAMPLES: SampleClient[] = [
  {
    short_name: 'GEC',
    company_name: 'Glencore Exploration Congo SARL',
    client_type: 'IE',
    email: 'ops@glencore-cd.example',
    phone: '+243 82 000 0001',
    address: 'Route de Kasumbalesa, Lubumbashi, Haut-Katanga',
    nif_number: 'CD/LUB/1234567',
  },
  {
    short_name: 'IVN',
    company_name: 'Kamoa Copper SA',
    client_type: 'IE',
    email: 'logistics@kamoa.example',
    phone: '+243 82 000 0002',
    address: 'Kolwezi, Lualaba Province',
    nif_number: 'CD/KWZ/2345678',
  },
  {
    short_name: 'TFM',
    company_name: 'Tenke Fungurume Mining SA',
    client_type: 'IE',
    email: 'supply@tfm.example',
    phone: '+243 82 000 0003',
    address: 'Route Fungurume, Lualaba',
    nif_number: 'CD/KWZ/3456789',
  },
  {
    short_name: 'BRC',
    company_name: 'Brasseries Simba SA',
    client_type: 'I',
    email: 'imports@simba.example',
    phone: '+243 81 200 0004',
    address: '32 Avenue Kabalo, Gombe, Kinshasa',
    nif_number: 'CD/KIN/4567890',
  },
  {
    short_name: 'ORN',
    company_name: 'Orange RDC SA',
    client_type: 'I',
    email: 'procurement@orange-cd.example',
    phone: '+243 89 300 0005',
    address: 'Immeuble Zongo, Boulevard du 30 Juin, Kinshasa',
    nif_number: 'CD/KIN/5678901',
  },
  {
    short_name: 'AIR',
    company_name: 'Africell RDC SPRL',
    client_type: 'I',
    email: 'logistics@africell.example',
    phone: '+243 99 400 0006',
    address: 'Avenue Kalemie, Kinshasa',
    nif_number: 'CD/KIN/6789012',
  },
  {
    short_name: 'PWR',
    company_name: 'Kibali Goldmines SA',
    client_type: 'E',
    email: 'ops@kibali.example',
    phone: '+243 82 500 0007',
    address: 'Watsa, Haut-Uele',
    nif_number: 'CD/HUE/7890123',
  },
  {
    short_name: 'CIM',
    company_name: 'Cimenterie du Katanga SARL',
    client_type: 'IE',
    email: 'supply@cimkat.example',
    phone: '+243 97 600 0008',
    address: 'Likasi, Haut-Katanga',
    nif_number: 'CD/LKS/8901234',
  },
  {
    short_name: 'MAR',
    company_name: 'Marsavco SA',
    client_type: 'I',
    email: 'imports@marsavco.example',
    phone: '+243 81 700 0009',
    address: 'Avenue du Port, Kinshasa',
    nif_number: 'CD/KIN/9012345',
  },
  {
    short_name: 'BEL',
    company_name: 'Bralima SARL',
    client_type: 'I',
    email: 'imports@bralima.example',
    phone: '+243 81 800 0010',
    address: '912 Avenue du Flambeau, Kinshasa',
    nif_number: 'CD/KIN/0123456',
  },
];

export async function seedSampleClients(
  db: Database | Transaction,
): Promise<void> {
  for (const c of SAMPLES) {
    const [existing] = await db
      .select({ id: clientMaster.id })
      .from(clientMaster)
      .where(eq(clientMaster.shortName, c.short_name))
      .limit(1);

    if (existing) {
      // Refresh mutable fields but don't touch created_at.
      await db
        .update(clientMaster)
        .set({
          companyName: c.company_name,
          clientType: c.client_type,
          email: c.email,
          phone: c.phone,
          address: c.address,
          nifNumber: c.nif_number,
          updatedAt: sql`now()`,
        })
        .where(eq(clientMaster.id, existing.id));
    } else {
      await db.insert(clientMaster).values({
        shortName: c.short_name,
        companyName: c.company_name,
        clientType: c.client_type,
        email: c.email,
        phone: c.phone,
        address: c.address,
        nifNumber: c.nif_number,
      });
    }
  }
}
