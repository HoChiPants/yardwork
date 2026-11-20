import { useState } from "react";
import { ExternalLink, Plus, Wrench } from "lucide-react";
import type { Project } from "./model";
import {
  retailerCatalog,
  referenceOffersForProduct,
  type RetailerProduct,
} from "./retailerCatalog";
import {
  selectedToolsForProject,
  toolEvidenceTypeLabels,
  type ToolProject,
} from "./toolGuide";
import { toolChecklist } from "./tools";
import { addSupply, supplyProducts } from "./supplies";
export function ToolsPanel({
  project,
  onChange,
}: {
  project: Project;
  onChange: (project: Project) => void;
}) {
  const [purchaseError, setPurchaseError] = useState("");
  const p = project as ToolProject,
    selected = selectedToolsForProject(p),
    checklist = toolChecklist(project, selected.tools);
  const products = retailerCatalog
    .filter((product) => product.category === "tool")
    .map((product) => ({
      product,
      operations: checklist.requirements.filter((row) =>
        product.capabilities.includes(row.capability),
      ),
    }))
    .sort(
      (a, b) => Number(!!b.operations.length) - Number(!!a.operations.length),
    );
  const selections = p.toolSelections ?? [];
  const purchaseOptions = supplyProducts(project.retailer, "tools");
  const purchasable = new Set(purchaseOptions.map((product) => product.id));
  const purchases = new Set(
    project.supplies.map((selection) => selection.productId),
  );
  function purchaseAction(product: RetailerProduct, operation?: string) {
    if (purchases.has(product.id))
      return <span className="small-note">On shopping list</span>;
    const name = product.manufacturerPartNumber ?? product.name;
    return (
      <button
        type="button"
        className="text-button"
        aria-label={`Add ${name} to shopping list${operation ? ` for ${operation}` : ""}`}
        onClick={() => {
          setPurchaseError("");
          try {
            onChange(addSupply(project, product.id, 1));
          } catch (error) {
            setPurchaseError(
              error instanceof Error
                ? error.message
                : "The tool could not be added.",
            );
          }
        }}
      >
        <Plus size={13} /> Add to list
      </button>
    );
  }
  const update = (productId: string, checked: boolean) =>
    onChange({
      ...project,
      toolSelections: [
        ...selections.filter((selection) => selection.productId !== productId),
        ...(checked
          ? [{ productId, checkedAt: new Date().toISOString() }]
          : []),
      ],
    } as Project);
  const warnings = [...new Set([...selected.warnings, ...checklist.warnings])];
  return (
    <>
      <span className="eyebrow">TOOLS FOR YOUR OPERATIONS</span>
      <h2>
        <Wrench size={18} /> Plan the tools.
      </h2>
      <p>
        Review the documented functions you intend to use. A checked model
        records your review; it does not confirm ownership, working condition or
        safe operation. Check the actual tool type/manual revision and every
        blade, bit and work setup.
      </p>
      <div className="notice">
        <p>
          {checklist.coverage.supportedRequired} of{" "}
          {checklist.coverage.required} required capabilities have documented
          selections. {checklist.coverage.unknownRequired} remain unknown;{" "}
          {checklist.coverage.conditional} depend on the operation. Tools stay
          separate from the material quantities and cost. Use Add to list for
          tools you need to buy.
        </p>
      </div>
      <h4>Real models to review</h4>
      {purchaseError && (
        <p className="form-error" role="alert">
          {purchaseError}
        </p>
      )}
      {products.map(({ product, operations }) => {
        const checked = selections.some(
          (selection) => selection.productId === product.id,
        );
        const historicalOffers = product.offers.filter(
          (offer) => offer.listingStatus !== "reference",
        );
        return (
          <div className="section-description" key={product.id}>
            <label className="field">
              <span>
                <input
                  type="checkbox"
                  aria-label={`Reviewed ${product.manufacturerPartNumber ?? product.name}`}
                  checked={checked}
                  onChange={(event) => update(product.id, event.target.checked)}
                />{" "}
                <strong>{product.name}</strong>
              </span>
            </label>
            <p className="small-note">
              {operations.length
                ? operations.map((operation) => operation.name).join(" · ")
                : `${product.manufacturer} · ${product.manufacturerPartNumber}`}
            </p>
            <div className="inline">
              {referenceOffersForProduct(product).map((offer) => (
                <a
                  key={`${offer.retailer}-${offer.productId}`}
                  href={offer.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {offer.retailer === "home-depot" ? "Home Depot" : "Lowe's"}{" "}
                  <ExternalLink size={12} />
                </a>
              ))}
              {purchasable.has(product.id) && purchaseAction(product)}
            </div>
            {product.toolCapabilityEvidence.map((proof, index) => (
              <details key={`${proof.evidenceType}-${index}`}>
                <summary>
                  {toolEvidenceTypeLabels[proof.evidenceType]} ·{" "}
                  {proof.capabilities.join(", ")}
                </summary>
                <p className="small-note">{proof.scope}</p>
                {proof.sourceRefs.map((url, i) => (
                  <p key={url} className="small-note">
                    <a href={url} target="_blank" rel="noreferrer">
                      {toolEvidenceTypeLabels[proof.evidenceType]} {i + 1}{" "}
                      <ExternalLink size={12} />
                    </a>
                  </p>
                ))}
                <ul className="small-note">
                  {proof.requirements.map((requirement) => (
                    <li key={requirement}>{requirement}</li>
                  ))}
                </ul>
              </details>
            ))}
            {historicalOffers.length > 0 && (
              <details>
                <summary>
                  Historical retailer references · no longer sold
                </summary>
                {historicalOffers.map((offer) => (
                  <p
                    key={`${offer.retailer}-${offer.productId}`}
                    className="small-note"
                  >
                    <a href={offer.url} target="_blank" rel="noreferrer">
                      Retired{" "}
                      {offer.retailer === "home-depot"
                        ? "Home Depot"
                        : "Lowe's"}{" "}
                      listing <ExternalLink size={12} />
                    </a>{" "}
                    · {offer.seller} · {offer.retailerModel}
                  </p>
                ))}
              </details>
            )}
            {product.discrepancies.map((discrepancy) => (
              <p key={discrepancy} className="small-note">
                {discrepancy}
              </p>
            ))}
          </div>
        );
      })}
      {selected.selections
        .filter((selection) => selection.status === "unknown")
        .map((selection) => (
          <div
            className="notice"
            key={`${selection.productId}-${selection.checkedAt}`}
          >
            <p>
              <strong>Unknown selection: {selection.name}</strong>
              <br />
              {selection.issues.join(" ")}
            </p>
            <button
              className="text-button"
              onClick={() => update(selection.productId, false)}
            >
              Remove selection
            </button>
          </div>
        ))}
      <h4>Operations to cover</h4>
      {!checklist.requirements.length && (
        <p>Add parts or set a work zone to derive a tool checklist.</p>
      )}
      {checklist.requirements.map((row) => {
        const options = purchaseOptions.filter((product) =>
          product.capabilities.includes(row.capability),
        );
        return (
          <details className="section-description" key={row.capability}>
            <summary>
              <strong>{row.name}</strong>
              <br />
              <small>
                {row.necessity} ·{" "}
                {row.status === "supported"
                  ? "documented capability supported"
                  : "unknown"}
              </small>
            </summary>
            {row.condition && <p className="small-note">{row.condition}</p>}
            <ul>
              {row.sources.map((source, i) => (
                <li key={`${source.kind}-${source.id}-${i}`}>
                  {source.reason}
                </li>
              ))}
            </ul>
            {row.supportedBy.map((tool) => (
              <p key={tool.toolId}>
                {tool.toolName} ·{" "}
                {tool.evidenceUrls.map((url, i) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    Manufacturer evidence {i + 1} <ExternalLink size={12} />
                  </a>
                ))}
              </p>
            ))}
            <p>{row.review}</p>
            {options.length > 0 && (
              <ul aria-label={`Home Depot options for ${row.name}`}>
                {options.map((product) => {
                  const offer = referenceOffersForProduct(product).find(
                    (item) => item.retailer === project.retailer,
                  );
                  return (
                    <li key={product.id}>
                      <a href={offer?.url} target="_blank" rel="noreferrer">
                        {product.name} <ExternalLink size={12} />
                      </a>
                      {" · "}
                      {purchaseAction(product, row.name)}
                    </li>
                  );
                })}
              </ul>
            )}
            {row.referenceUrls.map((url) => (
              <a
                key={url}
                className="small-note"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                Operation reference <ExternalLink size={12} />
              </a>
            ))}
          </details>
        );
      })}
      {warnings.length > 0 && (
        <div className="notice">
          <div>
            <strong>Unresolved tool questions</strong>
            <ul>
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <p className="small-note">
        Product links are references. No tool price or store availability has
        been checked. Documented capability is not construction approval.
      </p>
    </>
  );
}
