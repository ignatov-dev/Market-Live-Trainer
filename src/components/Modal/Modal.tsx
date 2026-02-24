import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';

interface Props {
  isOpen: boolean;
  title: string;
  onClose?: () => void;
  children?: React.ReactNode;
  closeLabel?: string;
  hideHeader?: boolean;
  panelClassName?: string;
  bodyClassName?: string;
  backdropClassName?: string;
}

export default function Modal({
  isOpen,
  title,
  onClose,
  children,
  closeLabel = 'Close',
  hideHeader = false,
  panelClassName,
  bodyClassName,
  backdropClassName,
}: Props) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose?.();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          className={[styles.backdrop, backdropClassName].filter(Boolean).join(' ')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onMouseDown={(event: React.MouseEvent<HTMLDivElement>) => {
            if (event.target === event.currentTarget) {
              onClose?.();
            }
          }}
        >
          <motion.div
            className={[styles.panel, panelClassName].filter(Boolean).join(' ')}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {!hideHeader ? (
              <div className={styles.header}>
                <h3 className={styles.title}>{title}</h3>
                <button type="button" className={styles.closeButton} onClick={onClose}>
                  {closeLabel}
                </button>
              </div>
            ) : null}
            <div
              className={[
                styles.body,
                hideHeader ? styles.bodyNoPad : '',
                bodyClassName,
              ].filter(Boolean).join(' ')}
            >
              {children}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
