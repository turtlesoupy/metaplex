import {
  CheckCircleTwoTone,
  LoadingOutlined,
  PlayCircleOutlined,
  SyncOutlined
} from '@ant-design/icons';
import {
  programIds,
  useConnection,
  useUserAccounts,
  useWallet,
  VaultState,
} from '@oyster/common';
import { Badge, List, Popover } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Connection,
  PublicKey,
} from '@solana/web3.js';
import { Link } from 'react-router-dom';
import { closePersonalEscrow } from '../../actions/closePersonalEscrow';
import { decommAuctionManagerAndReturnPrizes } from '../../actions/decommAuctionManagerAndReturnPrizes';
import { sendSignMetadata } from '../../actions/sendSignMetadata';
import { unwindVault } from '../../actions/unwindVault';
import { settle } from '../../actions/settle';
import { startAuctionManually } from '../../actions/startAuctionManually';

import { QUOTE_MINT } from '../../constants';
import { useMeta } from '../../contexts';
import { AuctionViewState, useAuctions } from '../../hooks';
import { WalletAdapter } from '@solana/wallet-base';
interface NotificationCard {
  id: string;
  title: string;
  description: string | JSX.Element;
  action: () => Promise<boolean>;
  dismiss?: () => Promise<boolean>;
}

enum RunActionState {
  NotRunning,
  Running,
  Success,
  Failed,
}

function RunAction({
  id,
  action,
  onFinish,
  icon,
}: {
  id: string;
  action: () => Promise<boolean>;
  onFinish?: () => void;
  icon: JSX.Element;
}) {
  const [state, setRunState] = useState<RunActionState>(
    RunActionState.NotRunning,
  );

  useMemo(() => setRunState(RunActionState.NotRunning), [id]);

  const run = async () => {
    await setRunState(RunActionState.Running);
    const result = await action();
    if (result) {
      await setRunState(RunActionState.Success);
      setTimeout(() => (onFinish ? onFinish() : null), 2000); // Give user a sense of completion before removal from list
    } else {
      await setRunState(RunActionState.Failed);
    }
  };

  let component;
  switch (state) {
    case RunActionState.NotRunning:
      component = (
        <span className="hover-button" onClick={run}>
          {icon}
        </span>
      );
      break;
    case RunActionState.Failed:
      component = (
        <span className="hover-button" onClick={run}>
          <SyncOutlined />
        </span>
      );
      break;
    case RunActionState.Running:
      component = <LoadingOutlined />;
      break;
    case RunActionState.Success:
      component = <CheckCircleTwoTone twoToneColor="#52c41a" />;
  }

  return component;
}

export async function getPersonalEscrowAta(
  wallet: WalletAdapter | undefined,
): Promise<PublicKey | undefined> {
  const PROGRAM_IDS = programIds();
  if (!wallet?.publicKey) return undefined;
  return (
    await PublicKey.findProgramAddress(
      [
        wallet.publicKey.toBuffer(),
        PROGRAM_IDS.token.toBuffer(),
        QUOTE_MINT.toBuffer(),
      ],
      PROGRAM_IDS.associatedToken,
    )
  )[0];
}

export function useCollapseWrappedSol({
  connection,
  wallet,
  notifications,
}: {
  connection: Connection;
  wallet: WalletAdapter | undefined;
  notifications: NotificationCard[];
}) {
  const [showNotification, setShowNotification] = useState(false);
  const fn = async () => {
    const ata = await getPersonalEscrowAta(wallet);
    if (ata) {
      try {
        const balance = await connection.getTokenAccountBalance(ata);

        if ((balance && balance.value.uiAmount) || 0 > 0) {
          setShowNotification(true);
        }
      } catch (e) {}
    }
    setTimeout(fn, 60000);
  };
  useEffect(() => {
    fn();
  }, []);

  if (showNotification) {
    notifications.push({
      id: 'unsettled',
      title: 'Unsettled funds!',
      description:
        'You have unsettled royalties in your personal escrow account.',
      action: async () => {
        try {
          const ata = await getPersonalEscrowAta(wallet);
          if (ata) {
            const data = await connection.getAccountInfo(ata);
            if (data?.data.length || 0 > 0)
              await closePersonalEscrow(connection, wallet, ata);
          }
        } catch (e) {
          console.error(e);
          return false;
        }
        return true;
      },
    });
  }
}

const CALLING_MUTEX: Record<string, boolean> = {};
export function useSettlementAuctions({
  connection,
  wallet,
  notifications,
}: {
  connection: Connection;
  wallet: WalletAdapter | undefined;
  notifications: NotificationCard[];
}) {
  const { accountByMint } = useUserAccounts();
  const walletPubkey = wallet?.publicKey;
  const { bidderPotsByAuctionAndBidder } = useMeta();
  const auctionsNeedingSettling = useAuctions(AuctionViewState.Ended);

  const [validDiscoveredEndedAuctions, setValidDiscoveredEndedAuctions] =
    useState<Record<string, number>>({});
  useMemo(() => {
    const f = async () => {
      const nextBatch = auctionsNeedingSettling
        .filter(
          a =>
            walletPubkey &&
            a.auctionManager.info.authority.equals(walletPubkey) &&
            a.auction.info.ended(),
        )
        .sort(
          (a, b) =>
            (b.auction.info.endedAt?.toNumber() || 0) -
            (a.auction.info.endedAt?.toNumber() || 0),
        );
      for (let i = 0; i < nextBatch.length; i++) {
        const av = nextBatch[i];
        if (!CALLING_MUTEX[av.auctionManager.pubkey.toBase58()]) {
          CALLING_MUTEX[av.auctionManager.pubkey.toBase58()] = true;
          try {
            const balance = await connection.getTokenAccountBalance(
              av.auctionManager.info.acceptPayment,
            );
            if (
              ((balance.value.uiAmount || 0) === 0 &&
                av.auction.info.bidState.bids
                  .map(b => b.amount.toNumber())
                  .reduce((acc, r) => (acc += r), 0) > 0) ||
              (balance.value.uiAmount || 0) > 0.01
            ) {
              setValidDiscoveredEndedAuctions(old => ({
                ...old,
                [av.auctionManager.pubkey.toBase58()]:
                  balance.value.uiAmount || 0,
              }));
            }
          } catch (e) {
            console.error(e);
          }
        }
      }
    };
    f();
  }, [auctionsNeedingSettling.length, walletPubkey]);

  Object.keys(validDiscoveredEndedAuctions).forEach(auctionViewKey => {
    const auctionView = auctionsNeedingSettling.find(
      a => a.auctionManager.pubkey.toBase58() === auctionViewKey,
    );
    if (!auctionView) return;
    const winners = [...auctionView.auction.info.bidState.bids]
      .reverse()
      .slice(0, auctionView.auctionManager.info.settings.winningConfigs.length)
      .reduce((acc: Record<string, boolean>, r) => {
        acc[r.key.toBase58()] = true;
        return acc;
      }, {});

    const myPayingAccount = accountByMint.get(
      auctionView.auction.info.tokenMint.toBase58(),
    );
    const auctionKey = auctionView.auction.pubkey.toBase58();
    const bidsToClaim = Object.values(bidderPotsByAuctionAndBidder).filter(
      b =>
        winners[b.info.bidderAct.toBase58()] &&
        !b.info.emptied &&
        b.info.auctionAct.toBase58() === auctionKey,
    );
    if (bidsToClaim.length || validDiscoveredEndedAuctions[auctionViewKey] > 0)
      notifications.push({
        id: auctionViewKey,
        title: 'You have an ended auction that needs settling!',
        description: (
          <span>
            One of your auctions ended and it has monies that can be claimed.
            For more detail,{' '}
            <Link to={`/auction/${auctionKey}/billing`}>click here.</Link>
          </span>
        ),
        action: async () => {
          try {
            await settle(
              connection,
              wallet,
              auctionView,
              // Just claim all bidder pots
              bidsToClaim,
              myPayingAccount?.pubkey,
              accountByMint,
            );
            if (wallet?.publicKey) {
              const ata = await getPersonalEscrowAta(wallet);
              if (ata) await closePersonalEscrow(connection, wallet, ata);
            }
          } catch (e) {
            console.error(e);
            return false;
          }
          return true;
        },
      });
  });
}

export function Notifications() {
  const {
    metadata,
    whitelistedCreatorsByCreator,
    store,
    vaults,
    safetyDepositBoxesByVaultAndIndex,
  } = useMeta();
  const possiblyBrokenAuctionManagerSetups = useAuctions(
    AuctionViewState.Defective,
  );
  const upcomingAuctions = useAuctions(AuctionViewState.Upcoming);
  const connection = useConnection();
  const { wallet } = useWallet();
  const { accountByMint } = useUserAccounts();

  const notifications: NotificationCard[] = [];

  const walletPubkey = wallet?.publicKey?.toBase58() || '';

  useCollapseWrappedSol({ connection, wallet, notifications });

  useSettlementAuctions({ connection, wallet, notifications });

  const vaultsNeedUnwinding = useMemo(
    () =>
      Object.values(vaults).filter(
        v =>
          v.info.authority.toBase58() === walletPubkey &&
          v.info.state !== VaultState.Deactivated &&
          v.info.tokenTypeCount > 0,
      ),
    [vaults, walletPubkey],
  );

  vaultsNeedUnwinding.forEach(v => {
    notifications.push({
      id: v.pubkey.toBase58(),
      title: 'You have items locked in a defective auction!',
      description: (
        <span>
          During an auction creation process that probably had some issues, you
          lost an item. Reclaim it now.
        </span>
      ),
      action: async () => {
        try {
          await unwindVault(
            connection,
            wallet,
            v,
            safetyDepositBoxesByVaultAndIndex,
          );
        } catch (e) {
          console.error(e);
          return false;
        }
        return true;
      },
    });
  });

  possiblyBrokenAuctionManagerSetups
    .filter(v => v.auctionManager.info.authority.toBase58() === walletPubkey)
    .forEach(v => {
      notifications.push({
        id: v.auctionManager.pubkey.toBase58(),
        title: 'You have items locked in a defective auction!',
        description: (
          <span>
            During an auction creation process that probably had some issues,
            you lost an item. Reclaim it now.
          </span>
        ),
        action: async () => {
          try {
            await decommAuctionManagerAndReturnPrizes(
              connection,
              wallet,
              v,
              accountByMint,
            );
          } catch (e) {
            console.error(e);
            return false;
          }
          return true;
        },
      });
    });

  const metaNeedsApproving = useMemo(
    () =>
      metadata.filter(m => {
        return (
          m.info.data.creators &&
          (whitelistedCreatorsByCreator[m.info.updateAuthority.toBase58()]?.info
            ?.activated ||
            store?.info.public) &&
          m.info.data.creators.find(
            c => c.address.toBase58() === walletPubkey && !c.verified,
          )
        );
      }),
    [metadata, whitelistedCreatorsByCreator, walletPubkey],
  );

  metaNeedsApproving.forEach(m => {
    notifications.push({
      id: m.pubkey.toBase58(),
      title: 'You have a new artwork to approve!',
      description: (
        <span>
          {whitelistedCreatorsByCreator[m.info.updateAuthority.toBase58()]?.info
            ?.name || m.pubkey.toBase58()}{' '}
          wants you to approve that you helped create their art{' '}
          <Link to={`/art/${m.pubkey.toBase58()}`}>here.</Link>
        </span>
      ),
      action: async () => {
        try {
          await sendSignMetadata(connection, wallet, m.pubkey);
        } catch (e) {
          console.error(e);
          return false;
        }
        return true;
      },
    });
  });

  upcomingAuctions
    .filter(v => v.auctionManager.info.authority.toBase58() === walletPubkey)
    .forEach(v => {
      notifications.push({
        id: v.auctionManager.pubkey.toBase58(),
        title: 'You have an auction which is not started yet!',
        description: <span>You can activate it now if you wish.</span>,
        action: async () => {
          try {
            await startAuctionManually(connection, wallet, v);
          } catch (e) {
            console.error(e);
            return false;
          }
          return true;
        },
      });
    });

  const content = notifications.length ? (
    <div style={{ width: '300px' }}>
      <List
        itemLayout="vertical"
        size="small"
        dataSource={notifications.slice(0, 10)}
        renderItem={(item: NotificationCard) => (
          <List.Item
            extra={
              <>
                <RunAction
                  id={item.id}
                  action={item.action}
                  icon={<PlayCircleOutlined />}
                />
                {item.dismiss && (
                  <RunAction
                    id={item.id}
                    action={item.dismiss}
                    icon={<PlayCircleOutlined />}
                  />
                )}
              </>
            }
          >
            <List.Item.Meta
              title={<span>{item.title}</span>}
              description={
                <span>
                  <i>{item.description}</i>
                </span>
              }
            />
          </List.Item>
        )}
      />
    </div>
  ) : (
    <span>No notifications</span>
  );

  const justContent = (
    <Popover
      className="noty-popover"
      placement="bottomLeft"
      content={content}
      trigger="click"
    >
      <svg
          className="ck-logo-svg"
          viewBox="0 0 1800 1020"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect width="800" height="1020" fill="black" />
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M60 0H120H180H240H300H360H420H480H540H600H660V60V120V180H720V240H660H600V180V120V60H540H480H420H360H300H240H180H120H60V0ZM60 960H0V900V840V780V720V660V600V540V480V420V360V300V240V180V120V60H60V120V180V240V300V360V420V480V540V600V660V720V780V840V900V960ZM1680 960V1020H1620H1560H1500H1440H1380H1320H1260H1200H1140H1080H1020H960H900H840H780H720H660H600H540H480H420H360H300H240H180H120H60V960H120H180H240H300H360H420H480H540H600H660H720H780H840H900H960H1020H1080H1140H1200H1260H1320H1380H1440H1500H1560H1620H1680ZM1740 840V900V960H1680V900V840H1740ZM1740 600H1800V660V720V780V840H1740V780V720V660V600ZM1680 480H1740V540V600H1680V540V480ZM1500 420H1560H1620H1680V480H1620H1560H1500V420ZM1200 360H1260H1320H1380H1440H1500V420H1440H1380H1320H1260H1200V360ZM960 300H1020H1080H1140H1200V360H1140H1080H1020H960V300ZM960 300V240H900H840H780H720V300H780H840H900H960ZM240 120H180V180H120V240V300V360V420V480V540V589V600V649H180H240H300V589V529V469H240V529V589H180V540V480V420V360V300V240V180H240V240V300V360H300V300V240V180V120H240ZM720 720H660V780H600V840V900H660H720H780V840H720H660V780H720H780V720H720ZM1140 720H1200H1260V780H1200V840H1260V900H1200H1140V840H1080V780H1140V720ZM480 120H420V180H360V240V300V360V420V480V540V600V660H420V600V540V480V420V360V300V240V180H480V240V300V360H540V300V240V180V120H480ZM1380 720H1440H1500V780H1440H1380V720ZM1380 780V840V900H1320V840V780H1380ZM1620 660H1560V720V780V840H1500V900H1560H1620V840V780V720H1680V660H1620ZM1560 540H1620V600H1560V540ZM900 420H960H1020V480V540V600H960H900V660H840V600V540V480V420V360H900V420ZM900 480V540H960V480H900ZM1140 480H1200H1260V540H1200V600V660H1140H1080V600H1140V540H1080V480V420H1140V480ZM420 720H480H540V780H480V840H540V900H480H420H360V840H420V780H360V720H420ZM1440 480H1380H1320V540V600V660H1380H1440H1500V600V540H1440V480ZM1380 540H1440V600H1380V540ZM180 720H120V780V840V900H180V840H240V900H300V840H240V780H300V720H240V780H180V720ZM840 720H900V780H960V840H900V900H840V840V780V720ZM960 840H1020V900H960V840ZM960 780V720H1020V780H960ZM720 480H660V420V360V300H600V360V420V480V540H660H720V600H660H600H540V540V480H480V540V600H540V660H600H660H720V600H780V540V480V420V360H720V420V480Z"
            fill="white"
          />
      </svg>
    </Popover>
  );

  if (notifications.length === 0) return justContent;
  else
    return (
      <Badge count={notifications.length} style={{ backgroundColor: 'white' }}>
        {justContent}
      </Badge>
    );
}
