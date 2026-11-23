import { plannedStockCutOrderContext, plannedStockCutOrderTitle, recordedStockCutOrderContext, recordedStockCutOrderTitle, type StockCutOrderView } from "./plannedCutSources";

export function SavedStockCutSteps({ order }: { order: StockCutOrderView }) {
  return order.issue ? <p className="small-note"><strong>Review needed.</strong> {order.issue}</p> : <>
    {order.status && <p className="small-note">{order.status}</p>}
    {order.bladeAllowance && <p className="small-note">{order.bladeAllowance}</p>}
    {order.review && <p className="small-note">{order.review}</p>}
    <ol>
      {order.steps.map((step, index) => <li key={order.stepIds[index]}>{step}</li>)}
    </ol>
  </>;
}

export function PrintStockCutOrders({ orders, recorded = false }: { orders: readonly StockCutOrderView[]; recorded?: boolean }) {
  if (!orders.length) return null;
  return <section className={recorded ? "recorded-stock-cut-order-print" : "planned-stock-cut-order-print"}>
    <h2>{recorded ? recordedStockCutOrderTitle : plannedStockCutOrderTitle}</h2>
    <p>{recorded ? recordedStockCutOrderContext : plannedStockCutOrderContext}</p>
    {orders.map((order) => <section key={order.sourceId}>
      <h3>{order.title}</h3>
      {order.size && <p>Starting stock · {order.size} (length × width × thickness).</p>}
      <SavedStockCutSteps order={order} />
    </section>)}
  </section>;
}
