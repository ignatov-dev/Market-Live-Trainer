import Modal from '../Modal/Modal';
import BracketField from '../BracketField/BracketField';
import styles from './PositionBracketModal.module.css';
import { fmtPrice, fmtSigned, getPairCompactLabel } from '../../utils/formatters';
import type { LocalPosition, PositionBracketEditor } from '../../types/domain';

interface BracketPnlResult {
  status: 'valid' | 'invalid' | 'empty';
  pnl: number | null;
}

interface PositionBracketPnlPreview {
  takeProfit: BracketPnlResult;
  stopLoss: BracketPnlResult;
}

interface Props {
  isOpen: boolean;
  title: string;
  editingPosition: LocalPosition | null;
  positionBracketEditor: PositionBracketEditor;
  positionBracketPnlPreview: PositionBracketPnlPreview;
  canDelete: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: () => void;
  onFieldChange: (field: 'takeProfit' | 'stopLoss', value: string) => void;
}

export default function PositionBracketModal({
  isOpen,
  title,
  editingPosition,
  positionBracketEditor,
  positionBracketPnlPreview,
  canDelete,
  onClose,
  onSave,
  onDelete,
  onFieldChange,
}: Props) {
  return (
    <Modal isOpen={isOpen} title={title} onClose={onClose}>
      <form
        className={styles.form}
        onSubmit={(event) => { event.preventDefault(); onSave(); }}
      >
        {editingPosition ? (
          <p className={styles.meta}>
            {editingPosition.side.toUpperCase()} {getPairCompactLabel(editingPosition.pair)}
          </p>
        ) : null}

        <label htmlFor="positionEntryPriceInput">
          Entry Price
          <input
            id="positionEntryPriceInput"
            type="text"
            value={editingPosition ? `$${fmtPrice(editingPosition.entryPrice)}` : ''}
            disabled
            readOnly
          />
        </label>

        <BracketField
          id="positionTakeProfitInput"
          label="Take-profit"
          value={positionBracketEditor.takeProfit}
          onChange={(event) => onFieldChange('takeProfit', event.target.value)}
          pnlText={positionBracketPnlPreview.takeProfit.status === 'valid' ? fmtSigned(positionBracketPnlPreview.takeProfit.pnl) : null}
          pnlTone={positionBracketPnlPreview.takeProfit.status !== 'valid' ? 'neutral' : (positionBracketPnlPreview.takeProfit.pnl ?? 0) >= 0 ? 'pos' : 'neg'}
        />

        <BracketField
          id="positionStopLossInput"
          label="Stop-loss"
          value={positionBracketEditor.stopLoss}
          onChange={(event) => onFieldChange('stopLoss', event.target.value)}
          pnlText={positionBracketPnlPreview.stopLoss.status === 'valid' ? fmtSigned(positionBracketPnlPreview.stopLoss.pnl) : null}
          pnlTone={positionBracketPnlPreview.stopLoss.status !== 'valid' ? 'neutral' : (positionBracketPnlPreview.stopLoss.pnl ?? 0) >= 0 ? 'pos' : 'neg'}
        />

        {positionBracketEditor.error ? <p className={styles.fieldError}>{positionBracketEditor.error}</p> : null}

        <div className={styles.actions}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDelete}`}
            onClick={onDelete}
            disabled={!canDelete}
          >
            Delete
          </button>
          <button type="submit" className={`${styles.btn} ${styles.btnSave}`}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
