import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Navbar, Hero, Story, Footer } from './Brand';
import { Menu } from './Menu';
import { Track, Kitchen } from './Orders';
import { Shopping } from './Shopping';
import { readSavedValue, saveValue } from './shared';
import './style.css';

const menuUrl = '/menu.json';
const maxSavedQuantity = 12;

function loadSavedBag(menu) {
  return readSavedValue('bag', []).filter((line) => (
    menu.some((item) => item.id === line.id)
    && Number.isInteger(line.qty)
    && line.qty >= 1
    && line.qty <= maxSavedQuantity
  ));
}

function CafePage({ path, menu, onChooseItem }) {
  if (path === '/track') return <Track />;
  if (path === '/kitchen') return <Kitchen />;

  return (
    <>
      <Hero menu={menu} />
      <Menu menu={menu} choose={onChooseItem} />
      <Story />
    </>
  );
}

function App({ menu }) {
  const [bag, setBag] = useState(() => loadSavedBag(menu));
  const [shoppingView, setShoppingView] = useState(null);
  const bagItemCount = bag.reduce((count, line) => count + line.qty, 0);

  function updateBag(nextBag) {
    saveValue('bag', nextBag);
    setBag(nextBag);
  }

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Navbar count={bagItemCount} open={() => setShoppingView({ type: 'bag' })} />

      <main id="main">
        <CafePage
          path={location.pathname}
          menu={menu}
          onChooseItem={(item) => setShoppingView({ type: 'item', item })}
        />
      </main>

      <Footer />

      {shoppingView && (
        <Shopping
          view={shoppingView}
          menu={menu}
          bag={bag}
          update={updateBag}
          setView={setShoppingView}
        />
      )}
    </>
  );
}

const root = createRoot(document.querySelector('#root'));

async function loadApp() {
  try {
    const response = await fetch(menuUrl);
    if (!response.ok) throw Error();

    const menu = await response.json();
    root.render(<App menu={menu} />);
  } catch {
    root.render(<p role="alert">Unable to load the café menu. Please refresh.</p>);
  }
}

loadApp();
