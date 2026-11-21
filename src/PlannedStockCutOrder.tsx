import { plannedStockCutOrderTitle, type PlannedStockCutOrder } from "./plannedCutSources";

export function SavedStockCutSteps({ order }: { order: PlannedStockCutOrder }) {
  return order.issue ? <p className="small-note"><strong>Review needed.</strong> {order.issue}</p> : <>
    {order.bladeAllowance && <p className="small-note">{order.bladeAllowance}</p>}
    {order.review && <p className="small-note">{order.review}</p>}
    <ol>
      {order.steps.map((step, index) => <li key={order.stepIds[index]}>{step}</li>)}
    </ol>
  </>;
}

export function PrintPlannedStockCutOrder({ orders }: { orders: readonly PlannedStockCutOrder[] }) {
  if (!orders.length) return null;
  return <section className="planned-stock-cut-order-print">
    <h2>{plannedStockCutOrderTitle}</h2>
    <p>Use the saved board or sheet order before cutting any offcuts it supplies.</p>
    {orders.map((order) => <section key={order.sourceId}>
      <h3>{order.title}</h3>
      {order.size && <p>Starting stock · {order.size} (length × width × thickness).</p>}
      <SavedStockCutSteps order={order} />
    </section>)}
  </section>;
}
