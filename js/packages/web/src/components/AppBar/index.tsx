import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button, Dropdown, Menu } from 'antd';
import { Notifications } from '../Notifications';
import useWindowDimensions from '../../utils/layout';
import { MenuOutlined } from '@ant-design/icons';
import {
  ConnectButton,
  CurrentUserBadge,
  programIds,
  useWallet,
} from '@oyster/common';
import { saveAdmin } from '../../actions/saveAdmin';
import { useMeta } from '../../contexts';

const UserActions = () => {
  const { wallet } = useWallet();
  const { whitelistedCreatorsByCreator, store } = useMeta();
  const pubkey = wallet?.publicKey?.toBase58() || '';

  /*
  const canCreate = useMemo(() => {
    return (
      store?.info?.public ||
      whitelistedCreatorsByCreator[pubkey]?.info?.activated
    );
  }, [pubkey, whitelistedCreatorsByCreator, store]);
  */
  const canCreate = false;
  const PROGRAM_IDS = programIds();

  return (
    <>
      {store && (
        <>
          {/* <Link to={`#`}>
            <Button className="app-btn">Bids</Button>
          </Link> */}
          {canCreate ? (
            <Link to={`/art/create`}>
              <Button className="app-btn">Create</Button>
            </Link>
          ) : null}
          <Link to={`/auction/create/0`}>
            <Button className="connector" type="primary">
              Sell
            </Button>
          </Link>
        </>
      )}
      {wallet &&
        wallet.publicKey?.toBase58() === PROGRAM_IDS.store?.toBase58() && (
          <Link to={`/admin`}>
            <Button
              className="app-btn"
              onClick={e => {
                e.preventDefault();
                /*
                (async () => {
                  await saveAdmin(connection, wallet, true, []);
                })();
                */
              }}
            >
              Admin
            </Button>
          </Link>
        )}
    </>
  );
};

const DefaultActions = ({ vertical = false }: { vertical?: boolean }) => {
  const { connected } = useWallet();
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
      }}
    >
      <Link to={`/`}>
        <Button className="app-btn">Live Auctions</Button>
      </Link>
      <Link to={`/artworks`}>
        <Button className="app-btn">{connected ? 'My Shoes' : 'Shoes'}</Button>
      </Link>
      <Link to={`/artists`}>
        <Button className="app-btn">Creators</Button>
      </Link>
    </div>
  );
};

const MetaplexMenu = () => {
  const { width } = useWindowDimensions();
  const { connected } = useWallet();

  if (width < 768)
    return (
      <>
        <Dropdown
          arrow
          placement="bottomLeft"
          trigger={['click']}
          overlay={
            <Menu>
              <Menu.Item>
                <Link to={`/`}>
                  <Button className="app-btn">Explore</Button>
                </Link>
              </Menu.Item>
              <Menu.Item>
                <Link to={`/artworks`}>
                  <Button className="app-btn">
                    {connected ? 'My Shoes' : 'Shoes'}
                  </Button>
                </Link>
              </Menu.Item>
              <Menu.Item>
                <Link to={`/artists`}>
                  <Button className="app-btn">Creators</Button>
                </Link>
              </Menu.Item>
            </Menu>
          }
        >
          <MenuOutlined style={{ fontSize: '1.4rem' }} />
        </Dropdown>
      </>
    );

  return <DefaultActions />;
};

export const AppBar = () => {
  const { connected } = useWallet();

  return (
    <>
      <div className="app-left app-bar-box">
        {window.location.hash !== '#/analytics' && <Notifications />}
        <div className="divider" />
        <MetaplexMenu />
      </div>
      {connected ? (
        <div className="app-right app-bar-box">
          <UserActions />
          <CurrentUserBadge
            showBalance={false}
            showAddress={false}
            iconSize={24}
          />
        </div>
      ) : (
        <ConnectButton type="primary" allowWalletChange />
      )}
    </>
  );
};
