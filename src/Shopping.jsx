import React, { useEffect, useRef, useState } from 'react';
import {
  api as requestApi,
  money as formatPrice,
  when as formatPickupTime,
  read as readSavedValue,
  save as saveValue,
} from './shared';

// Keep these values aligned with the order rules in server/api.js.
const maxQuantityPerVariation = 12;
const standardOption = 'Standard';
const regularMilk = 'Regular milk';
const oatMilk = 'Oat milk';
const oatMilkSurcharge = 30;

const dialogTitles = {
  bag: 'Your bag',
  item: 'On the menu',
  checkout: 'Pickup details',
};

function unitPrice(item, option) {
  return item.price + (option === oatMilk ? oatMilkSurcharge : 0);
}

function bagLineTotal(item, line) {
  return unitPrice(item, line.option) * line.qty;
}

function QuantityControl({ quantity, onChange }) {
  return (
    <div className="qty">
      <button
        aria-label="Decrease quantity"
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
      >
        −
      </button>
      <b>{quantity}</b>
      <button
        aria-label="Increase quantity"
        disabled={quantity >= maxQuantityPerVariation}
        onClick={() => onChange(quantity + 1)}
      >
        +
      </button>
    </div>
  );
}

function ItemDetails({ item, onAddToBag }) {
  const [quantity, setQuantity] = useState(1);
  const [option, setOption] = useState(item.milkOptions ? regularMilk : standardOption);
  const [errorMessage, setErrorMessage] = useState('');
  const total = unitPrice(item, option) * quantity;

  function addSelectedItem() {
    const added = onAddToBag({ id: item.id, option, qty: quantity });
    if (!added) {
      setErrorMessage(`A maximum of ${maxQuantityPerVariation} per variation can be ordered.`);
    }
  }

  return (
    <>
      <img className="itempic" src={item.image} alt={item.name} />
      <h2 className="itemtitle">{item.name}</h2>
      <p>{item.description}</p>

      {item.milkOptions && (
        <label className="field">
          Choose your milk
          <select value={option} onChange={(event) => setOption(event.target.value)}>
            <option>{regularMilk}</option>
            <option value={oatMilk}>{oatMilk} (+{formatPrice(oatMilkSurcharge)})</option>
          </select>
        </label>
      )}

      <div className="bar">
        <strong>Quantity</strong>
        <QuantityControl quantity={quantity} onChange={setQuantity} />
      </div>
      <p className="error" role="alert">{errorMessage}</p>
      <button className="btn w-full" onClick={addSelectedItem}>
        Add to bag · {formatPrice(total)}
      </button>
    </>
  );
}

function BagItem({ item, line, onQuantityChange, onRemove }) {
  return (
    <div className="row">
      <img src={item.image} alt="" />
      <div>
        <strong>{item.name}</strong>
        <small>{line.option === standardOption ? '' : line.option}</small>
        <QuantityControl quantity={line.qty} onChange={onQuantityChange} />
      </div>
      <div style={{flex:0,textAlign:'right'}}>
        <b>{formatPrice(bagLineTotal(item, line))}</b>
        <button className="remove" onClick={onRemove}>Remove</button>
      </div>
    </div>
  );
}

function Bag({ bag, findMenuItem, total, onUpdateBag, onCheckout, onClose }) {
  if (!bag.length) {
    return (
      <>
        <h2 className="itemtitle">Something brewing?</h2>
        <p>Your bag is empty. Pick a favourite from the menu to get started.</p>
        <a href="/#menu" className="btn" onClick={onClose}>Browse menu</a>
      </>
    );
  }

  function changeLineQuantity(lineIndex, quantity) {
    onUpdateBag(bag.map((line, index) => (
      index === lineIndex ? { ...line, qty: quantity } : line
    )));
  }

  function removeLine(lineIndex) {
    onUpdateBag(bag.filter((_, index) => index !== lineIndex));
  }

  return (
    <>
      {bag.map((line, index) => (
        <BagItem
          key={line.id + line.option}
          item={findMenuItem(line.id)}
          line={line}
          onQuantityChange={(quantity) => changeLineQuantity(index, quantity)}
          onRemove={() => removeLine(index)}
        />
      ))}
      <div className="bar">
        <strong>Pickup total</strong>
        <b>{formatPrice(total)}</b>
      </div>
      <button className="btn w-full" onClick={onCheckout}>Choose pickup time</button>
      <button className="remove" onClick={onClose}>Continue browsing</button>
    </>
  );
}

function Checkout({ bag, total, onBack, onComplete }) {
  const [pickupTimes, setPickupTimes] = useState([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slotRequestVersion, setSlotRequestVersion] = useState(0);

  function reloadPickupTimes() {
    setSlotRequestVersion((version) => version + 1);
  }

  useEffect(() => {
    let isCurrentRequest = true;

    requestApi('slots')
      .then((times) => {
        if (isCurrentRequest) setPickupTimes(times);
      })
      .catch((error) => {
        if (isCurrentRequest) setErrorMessage(error.message);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [slotRequestVersion]);

  async function submitOrder(event) {
    event.preventDefault();
    if (isSubmitting) return;

    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);

    try {
      const orderDetails = {
        name: form.get('name'),
        pickup: Number(form.get('pickup')),
        note: form.get('note'),
        items: bag,
      };

      // Reuse the request ID when retrying the same order.
      const orderSignature = JSON.stringify(orderDetails);
      const pendingOrder = readSavedValue('pending', {});
      const requestId = orderSignature === pendingOrder.sig
        ? pendingOrder.requestId
        : crypto.randomUUID();

      saveValue('pending', { sig: orderSignature, requestId });
      const receipt = await requestApi('orders', { ...orderDetails, requestId });
      onComplete(receipt);
    } catch (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      if (error.message.includes('pickup time')) reloadPickupTimes();
    }
  }

  return (
    <>
      <button className="remove" onClick={onBack}>Back to bag</button>
      {errorMessage && <p className="error" role="alert">{errorMessage}</p>}

      {pickupTimes.length ? (
        <form onSubmit={submitOrder}>
          <label className="field">
            Pickup name
            <input name="name" maxLength={60} autoComplete="given-name" required />
          </label>
          <label className="field">
            Pickup time · IST
            <select name="pickup">
              {pickupTimes.map((time) => (
                <option key={time} value={time}>{formatPickupTime(time)}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Kitchen note (optional)
            <textarea
              name="note"
              maxLength={250}
              rows={3}
              placeholder="Anything the kitchen should know?"
            />
          </label>
          <p>Collect at Thorn n’ Petals in Thrissur and pay at the counter.</p>
          <div className="bar">
            <b>Total due at pickup</b>
            <strong>{formatPrice(total)}</strong>
          </div>
          <button disabled={isSubmitting} className="btn w-full">Place pickup order</button>
        </form>
      ) : (
        <p>
          {errorMessage
            ? <button className="outline" onClick={reloadPickupTimes}>Retry</button>
            : 'Checking pickup times…'}
        </p>
      )}
    </>
  );
}

export function Shopping({ view, menu, bag, update: updateBag, setView }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }, [view]);

  const findMenuItem = (id) => menu.find((item) => item.id === id);
  const total = bag.reduce((sum, line) => sum + bagLineTotal(findMenuItem(line.id), line), 0);

  function closeDialog() {
    setView(null);
  }

  function showBag() {
    setView({ type: 'bag' });
  }

  function addToBag(newLine) {
    const existingLine = bag.find((line) => (
      line.id === newLine.id && line.option === newLine.option
    ));
    const combinedQuantity = (existingLine?.qty ?? 0) + newLine.qty;
    if (combinedQuantity > maxQuantityPerVariation) return false;

    const nextBag = existingLine
      ? bag.map((line) => line === existingLine ? { ...line, qty: combinedQuantity } : line)
      : [...bag, newLine];
    updateBag(nextBag);
    showBag();
    return true;
  }

  function completeOrder({ ref, code }) {
    const previousOrders = readSavedValue('history', []).filter((orderRef) => orderRef !== ref);
    saveValue('history', [ref, ...previousOrders].slice(0, 30));
    saveValue('codes', { ...readSavedValue('codes', {}), [ref]: code });
    localStorage.removeItem('petals-pending');
    updateBag([]);
    location.assign('/track?ref=' + code);
  }

  function handleBackdropClick(event) {
    const dialog = dialogRef.current;
    if (event.target === dialog && event.clientX < dialog.getBoundingClientRect().left) {
      closeDialog();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={closeDialog}
      aria-label="Your order"
      onClick={handleBackdropClick}
    >
      <div className="dialoghead">
        <strong>{dialogTitles[view.type]}</strong>
        <button className="close" aria-label="Close" onClick={closeDialog}>×</button>
      </div>

      {view.type === 'item' && <ItemDetails item={view.item} onAddToBag={addToBag} />}
      {view.type === 'checkout' && (
        <Checkout bag={bag} total={total} onBack={showBag} onComplete={completeOrder} />
      )}
      {view.type !== 'item' && view.type !== 'checkout' && (
        <Bag
          bag={bag}
          findMenuItem={findMenuItem}
          total={total}
          onUpdateBag={updateBag}
          onCheckout={() => setView({ type: 'checkout' })}
          onClose={closeDialog}
        />
      )}
    </dialog>
  );
}
