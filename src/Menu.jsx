import React, { useState } from 'react';
import { money as formatPrice } from './shared';

const menuCategories = ['All', 'Drinks', 'Breakfast', 'Small plates', 'Lunch', 'Desserts'];

function MenuCard({ item, onChoose }) {
  return (
    <article className="food">
      <button className="foodimage" aria-label={`View ${item.name}`} onClick={onChoose}>
        <img src={item.image} loading="lazy" alt="" />
      </button>
      <div className="cardbody">
        <small>{item.category}</small>
        <h3>{item.name}</h3>
        <div className="cardbottom">
          <strong>{formatPrice(item.price)}</strong>
          <button className="plus" aria-label={`Order ${item.name}`} onClick={onChoose}>
            +
          </button>
        </div>
      </div>
    </article>
  );
}

export function Menu({ menu, choose: chooseItem }) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchText, setSearchText] = useState('');
  const searchQuery = searchText.trim().toLowerCase();
  const visibleItems = menu.filter((item) => (
    (selectedCategory === 'All' || item.category === selectedCategory)
    && item.name.toLowerCase().includes(searchQuery)
  ));

  return (
    <section className="menu area" id="menu">
      <div className="sectiontop">
        <div>
          <p className="eyebrow">From the counter</p>
          <h2>The café menu<span>.</span></h2>
        </div>
        <label className="search">
          <span aria-hidden="true">⚲</span>
          <input
            type="search"
            aria-label="Search menu"
            placeholder="Search the menu"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
      </div>

      <div className="filters" aria-label="Menu categories">
        {menuCategories.map((category) => (
          <button
            key={category}
            aria-pressed={category === selectedCategory}
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="cards">
        {visibleItems.map((item) => (
          <MenuCard key={item.id} item={item} onChoose={() => chooseItem(item)} />
        ))}
        {!visibleItems.length && <p>No matching items. Try another category or search.</p>}
      </div>
    </section>
  );
}
