import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export default function LayoutGrid({ children }: Props) {
  const { scrollY } = useScroll();
  const layoutGridPaddingXRaw = useTransform(scrollY, [0, 160], [100, 60]);
  const layoutGridPaddingX = useSpring(layoutGridPaddingXRaw, {
    stiffness: 220,
    damping: 34,
    mass: 0.35,
  });

  return (
    <motion.main
      className="layout-grid"
      style={{
        paddingTop: 400,
        paddingRight: layoutGridPaddingX,
        paddingBottom: 0,
        paddingLeft: layoutGridPaddingX,
      }}
    >
      {children}
    </motion.main>
  );
}
