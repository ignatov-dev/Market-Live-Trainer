import Modal from '../../Modal/Modal';
import styles from './DemoButton.module.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function DemoVideoModal({ isOpen, onClose }: Props) {
  return (
    <Modal
      isOpen={isOpen}
      title="Demo Video"
      onClose={onClose}
      hideHeader
      backdropClassName={styles.videoModalBackdrop}
      panelClassName={styles.videoModalPanel}
      bodyClassName={styles.videoModalBody}
    >
      <div className={styles.videoShell}>
        <button
          type="button"
          className={styles.videoCloseButton}
          onClick={onClose}
          aria-label="Close demo video"
        >
          <svg className={styles.videoCloseIcon} viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6.75 6.75L17.25 17.25M17.25 6.75L6.75 17.25"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <video
          className={styles.video}
          src="/LightCardsSequence.mp4"
          autoPlay
          playsInline
        />
      </div>
    </Modal>
  );
}
