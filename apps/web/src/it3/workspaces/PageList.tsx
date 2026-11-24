import styles from "./workspaces.module.css";
import { T, useGT } from "gt-react";
import { useState, type ReactNode } from "react";
export function PageList<T>({
  items,
  children,
}: {
  items: readonly T[];
  children: (item: T) => ReactNode;
}) {
  const gt = useGT();
  const [page, setPage] = useState(0);
  const last = Math.max(0, Math.ceil(items.length / 12) - 1);
  const current = Math.min(page, last);
  return (
    <>
      {items.slice(current * 12, current * 12 + 12).map(children)}
      {last > 0 && (
        <nav className={styles["iw-pager"]} aria-label={gt("Pages")}>
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            <T>Previous</T>
          </button>
          <span>
            {current + 1} / {last + 1}
          </span>
          <button disabled={current === last} onClick={() => setPage(current + 1)}>
            <T>Next</T>
          </button>
        </nav>
      )}
    </>
  );
}
