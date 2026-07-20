import { eq, sql } from 'drizzle-orm';
import { clientMaster } from '@/db/schema';
import type { Database, Transaction } from '@/lib/db';

// Ten sample DRC clients so the Clients Dashboard has data to show
// out of the box. Adapted from main's drizzle/0043_seed_clients.sql
// but trimmed to the columns this branch's client_master_t actually
// has (main had client_type, group_company_id, office_location_id,
// verified_by_id, etc. that we haven't ported).
//
// Idempotent — upserts by client_code (unique).

interface SampleClient {
  client_code: string;
  name: string;
  legal_name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
}

const SAMPLES: SampleClient[] = [
  {
    client_code: 'GEC001',
    name: 'Glencore Exploration Congo',
    legal_name: 'Glencore Exploration Congo SARL',
    email: 'ops@glencore-cd.example',
    phone: '+243 82 000 0001',
    address: 'Route de Kasumbalesa, Lubumbashi, Haut-Katanga',
    tax_id: 'CD/LUB/1234567',
  },
  {
    client_code: 'IVN002',
    name: 'Ivanhoe Kamoa Copper',
    legal_name: 'Kamoa Copper SA',
    email: 'logistics@kamoa.example',
    phone: '+243 82 000 0002',
    address: 'Kolwezi, Lualaba Province',
    tax_id: 'CD/KWZ/2345678',
  },
  {
    client_code: 'TFM003',
    name: 'Tenke Fungurume Mining',
    legal_name: 'Tenke Fungurume Mining SA',
    email: 'supply@tfm.example',
    phone: '+243 82 000 0003',
    address: 'Route Fungurume, Lualaba',
    tax_id: 'CD/KWZ/3456789',
  },
  {
    client_code: 'BRC004',
    name: 'Brasseries Simba',
    legal_name: 'Brasseries Simba SA',
    email: 'imports@simba.example',
    phone: '+243 81 200 0004',
    address: '32 Avenue Kabalo, Gombe, Kinshasa',
    tax_id: 'CD/KIN/4567890',
  },
  {
    client_code: 'ORN005',
    name: 'Orange RDC',
    legal_name: 'Orange RDC SA',
    email: 'procurement@orange-cd.example',
    phone: '+243 89 300 0005',
    address: 'Immeuble Zongo, Boulevard du 30 Juin, Kinshasa',
    tax_id: 'CD/KIN/5678901',
  },
  {
    client_code: 'AIR006',
    name: 'Africell RDC',
    legal_name: 'Africell RDC SPRL',
    email: 'logistics@africell.example',
    phone: '+243 99 400 0006',
    address: 'Avenue Kalemie, Kinshasa',
    tax_id: 'CD/KIN/6789012',
  },
  {
    client_code: 'PWR007',
    name: 'Kibali Gold Mine',
    legal_name: 'Kibali Goldmines SA',
    email: 'ops@kibali.example',
    phone: '+243 82 500 0007',
    address: 'Watsa, Haut-Uele',
    tax_id: 'CD/HUE/7890123',
  },
  {
    client_code: 'CIM008',
    name: 'Cimenterie du Katanga',
    legal_name: 'Cimenterie du Katanga SARL',
    email: 'supply@cimkat.example',
    phone: '+243 97 600 0008',
    address: 'Likasi, Haut-Katanga',
    tax_id: 'CD/LKS/8901234',
  },
  {
    client_code: 'MAR009',
    name: 'Marsavco',
    legal_name: 'Marsavco SA',
    email: 'imports@marsavco.example',
    phone: '+243 81 700 0009',
    address: 'Avenue du Port, Kinshasa',
    tax_id: 'CD/KIN/9012345',
  },
  {
    client_code: 'BEL010',
    name: 'Bralima',
    legal_name: 'Bralima SARL',
    email: 'imports@bralima.example',
    phone: '+243 81 800 0010',
    address: '912 Avenue du Flambeau, Kinshasa',
    tax_id: 'CD/KIN/0123456',
  },
];

export async function seedSampleClients(
  db: Database | Transaction,
): Promise<void> {
  for (const c of SAMPLES) {
    const [existing] = await db
      .select({ id: clientMaster.id })
      .from(clientMaster)
      .where(eq(clientMaster.clientCode, c.client_code))
      .limit(1);

    if (existing) {
      // Refresh mutable fields but don't touch created_at.
      await db
        .update(clientMaster)
        .set({
          name: c.name,
          legalName: c.legal_name,
          email: c.email,
          phone: c.phone,
          address: c.address,
          taxId: c.tax_id,
          updatedAt: sql`now()`,
        })
        .where(eq(clientMaster.id, existing.id));
    } else {
      await db.insert(clientMaster).values({
        clientCode: c.client_code,
        name: c.name,
        legalName: c.legal_name,
        email: c.email,
        phone: c.phone,
        address: c.address,
        taxId: c.tax_id,
      });
    }
  }
}
