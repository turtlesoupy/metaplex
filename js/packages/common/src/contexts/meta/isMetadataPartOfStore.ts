import { Metadata } from '../../actions';
import { Store, WhitelistedCreator } from '../../models/metaplex';
import { ParsedAccount } from '../accounts/types';

export const isMetadataPartOfStore = (
  m: ParsedAccount<Metadata>,
  whitelistedCreatorsByCreator: Record<
    string,
    ParsedAccount<WhitelistedCreator>
  >,
  store?: ParsedAccount<Store> | null,
) => {
  if (!m?.info?.data?.creators) {
    return false;
  }

  const BLACKLISTED_CREATIONS = new Set<string>([
    'Byi68moFBwtHUoaqx4b2dQtMpn2wVWBYrnzNyEHzaH3f',
    'G2WwmSvdsPggnotN3xvrEjNRiQcFuLmhy8L38NB9rske',
    'BWDDWben48HRiHUmLRj6yuySoQyw6XUgkC2TML41KEis',
  ]);

  if (BLACKLISTED_CREATIONS.has(m?.pubkey)) {
    return false;
  }

  if (
    !m?.info?.data?.creators?.find(
      c =>
        c.address === 'kickNLAj7N8kfEtXLuhpYJLGwZjJahuz7nr9tjKgn8e' ||
        c.address === 'DTjb25BnVEYJtGAWnS7typesD1rfEGUeLhLctu4MdxNS' ||
        c.address === 'bckupPkvbcbG7aEdfCz8PMUcAHrhNxE2z5V5Wz3CdnV',
    )
  ) {
    return false;
  }

  return m.info.data.creators.some(
    c =>
      c.verified &&
      (store?.info.public ||
        whitelistedCreatorsByCreator[c.address]?.info?.activated),
  );
};
