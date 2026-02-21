import React from 'react';
import styles from './TicketPanel.module.css';
import Tabs from '../Tabs/Tabs';
import BracketField from '../BracketField/BracketField';
import PendingOrdersList from './PendingOrdersList/PendingOrdersList';
import { ORDER_TYPE_TABS } from '../../constants/market';
import { fmtSigned } from '../../utils/formatters';
import { useTicketOrderController } from './hooks/useTicketOrderController';
import type { Ticket } from '../../types/domain';

export default function TicketPanel() {
  const {
    ticket,
    sessionPendingOrders,
    ticketValidation,
    ticketBracketPnlPreview,
    isBuyActionDisabled,
    isSellActionDisabled,
    isLoadingData,
    onTicketChange,
    onSubmitOrder,
    onTicketPreviewSide,
    onCancelOrder,
  } = useTicketOrderController();

  return (
    <section className="panel ticket-panel">
      <form className={styles.ticketForm} onSubmit={(event: React.FormEvent<HTMLFormElement>) => event.preventDefault()}>

        <div className={styles.ticketTabsRow}>
          <Tabs
            items={[...ORDER_TYPE_TABS]}
            value={ticket.type}
            onChange={(nextType) => onTicketChange({ type: nextType as Ticket['type'] })}
            ariaLabel="Order type"
            disabled={isLoadingData}
          />
        </div>

        <label htmlFor="qtyInput">
          Quantity
          <input
            id="qtyInput"
            type="number"
            step="0.001"
            min="0.001"
            value={ticket.qty}
            onChange={(event) => onTicketChange({ qty: event.target.value })}
            required
          />
        </label>
        {ticketValidation.qtyError ? <p className={styles.fieldError}>{ticketValidation.qtyError}</p> : null}
        {ticket.type === 'market' && ticketValidation.marginError ? (
          <p className={styles.fieldError}>{ticketValidation.marginError}</p>
        ) : null}

        {ticket.type === 'limit' ? (
          <>
            <label htmlFor="limitPriceInput">
              Limit price
              <input
                id="limitPriceInput"
                type="number"
                step="0.01"
                min="0.01"
                value={ticket.limitPrice}
                onChange={(event) => onTicketChange({ limitPrice: event.target.value })}
              />
            </label>
            {ticketValidation.limitPriceError ? <p className={styles.fieldError}>{ticketValidation.limitPriceError}</p> : null}
            {ticketValidation.marginError ? <p className={styles.fieldError}>{ticketValidation.marginError}</p> : null}
          </>
        ) : null}

        <div className={styles.ticketBracketsRow}>
          <BracketField
            id="tpInput"
            label="Take-profit"
            value={ticket.takeProfit}
            onChange={(event) => onTicketChange({ takeProfit: event.target.value })}
            pnlText={ticketBracketPnlPreview.takeProfit === null ? null : fmtSigned(ticketBracketPnlPreview.takeProfit)}
            pnlTone={ticketBracketPnlPreview.takeProfit === null ? 'neutral' : ticketBracketPnlPreview.takeProfit >= 0 ? 'pos' : 'neg'}
          />

          <BracketField
            id="stopInput"
            label="Stop-loss"
            value={ticket.stopLoss}
            onChange={(event) => onTicketChange({ stopLoss: event.target.value })}
            pnlText={ticketBracketPnlPreview.stopLoss === null ? null : fmtSigned(ticketBracketPnlPreview.stopLoss)}
            pnlTone={ticketBracketPnlPreview.stopLoss === null ? 'neutral' : ticketBracketPnlPreview.stopLoss >= 0 ? 'pos' : 'neg'}
          />
        </div>

        <div className={styles.ticketSideActions}>
          <button
            type="button"
            className={`${styles.ticketSideBtn} ${styles.ticketSideBtnBuy}`}
            disabled={isBuyActionDisabled}
            onMouseEnter={() => onTicketPreviewSide('buy')}
            onFocus={() => onTicketPreviewSide('buy')}
            onClick={() => onSubmitOrder('buy')}
          >
            Buy / Long
          </button>
          <button
            type="button"
            className={`${styles.ticketSideBtn} ${styles.ticketSideBtnSell}`}
            disabled={isSellActionDisabled}
            onMouseEnter={() => onTicketPreviewSide('sell')}
            onFocus={() => onTicketPreviewSide('sell')}
            onClick={() => onSubmitOrder('sell')}
          >
            Sell / Short
          </button>
        </div>
      </form>

      {ticketValidation.marketDataError ? <p className={styles.fieldError}>{ticketValidation.marketDataError}</p> : null}

      <PendingOrdersList
        orders={sessionPendingOrders}
        onCancel={onCancelOrder}
      />
    </section>
  );
}
