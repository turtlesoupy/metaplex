import { Metadata, ParsedAccount } from '@oyster/common';
import { Store, WhitelistedCreator } from '../../models/metaplex';

export const isMetadataPartOfStore = (
  m: ParsedAccount<Metadata>,
  store: ParsedAccount<Store> | null,
  whitelistedCreatorsByCreator: Record<
    string,
    ParsedAccount<WhitelistedCreator>
  >,
  useAll: boolean,
) => {
  if (useAll) {
    return true;
  }
  if (!m?.info?.data?.creators || !store?.info) {
    return false;
  }

  const BLACKLISTED_CREATIONS = new Set<string>([
    'Byi68moFBwtHUoaqx4b2dQtMpn2wVWBYrnzNyEHzaH3f',
    'G2WwmSvdsPggnotN3xvrEjNRiQcFuLmhy8L38NB9rske',
    'BWDDWben48HRiHUmLRj6yuySoQyw6XUgkC2TML41KEis',
  ]);

  if (!BLACKLISTED_CREATIONS.has(m?.pubkey.toBase58())) {
    return false;
  }

  if (
    !m?.info?.data?.creators?.find(
      c =>
        c.address.toBase58() ===
          'kickNLAj7N8kfEtXLuhpYJLGwZjJahuz7nr9tjKgn8e' ||
        c.address.toBase58() ===
          'DTjb25BnVEYJtGAWnS7typesD1rfEGUeLhLctu4MdxNS' ||
        c.address.toBase58() === 'bckupPkvbcbG7aEdfCz8PMUcAHrhNxE2z5V5Wz3CdnV',
    )
  ) {
    return false;
  }

  return m.info.data.creators.some(
    c =>
      c.verified &&
      (store.info.public ||
        whitelistedCreatorsByCreator[c.address]?.info?.activated),
  );
};
