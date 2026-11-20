import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { catalog, format, material } from "./model";
import { retailerCatalog, checkProductBinding } from "./retailerCatalog";
import { retailerName } from "./retailers";
export function CatalogReferences() {
  const [family, setFamily] = useState("all"),
    [selected, setSelected] = useState(catalog[0].id);
  const matches = retailerCatalog.filter(
    (p) => family === "all" || p.category === family,
  );
  return (
    <div className="catalog-references">
      <span className="eyebrow">PRODUCT IDENTITIES AND PHYSICAL SPECS</span>
      <h2 id="modal-title">Reviewed product references.</h2>
      <p>
        These are individual retailer listings and manufacturer specifications,
        not connected store inventory. Confirm local stock with a matching
        snapshot. Candidates and conflicting measurements remain unresolved.
      </p>
      <label className="field">
        Product category
        <select value={family} onChange={(e) => setFamily(e.target.value)}>
          <option value="all">All references</option>
          {["lumber", "rod", "panel", "fastener", "connector", "tool"].map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <label className="field">
        Compare with modeled stock
        <select
          aria-label="Compare modeled material"
          value={selected}
          onChange={(e) => setSelected(e.target.value as typeof selected)}
        >
          {catalog.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.subtitle}
            </option>
          ))}
        </select>
      </label>
      {matches.map((product) => {
        const check = checkProductBinding(material(selected), product);
        return (
          <article className="reference-card" key={product.id}>
            <h3>{product.name}</h3>
            <p>
              {product.manufacturer} ·{" "}
              {product.manufacturerPartNumber ??
                "Exact manufacturer identity unresolved"}
            </p>
            <span className="tag">
              {product.status === "candidate"
                ? "Candidate · verify identity"
                : "Specifications reviewed"}
            </span>
            <p className="small-note">
              {product.profile.stockSize
                ? `${product.profile.stockSize.map(format).join(" × ")} · ${product.profile.dimensionMeaning.replaceAll("-", " ")}`
                : "Body/stock dimensions unverified"}{" "}
              · {product.profile.packCount ?? "Unknown"} per purchase unit.
              Reviewed {new Date(product.verifiedAt).toLocaleDateString()}.
            </p>
            {product.profile.shankDiameter && (
              <p className="small-note">
                Shank {product.profile.shankDiameter} in · head{" "}
                {product.profile.headDiameter ?? "unknown"} in ·{" "}
                {product.profile.drive ?? "drive unspecified"}.
              </p>
            )}
            <div className="inline">
              {product.offers.map((offer) => (
                <a
                  key={offer.retailer + offer.productId}
                  href={offer.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {retailerName(offer.retailer)} · {offer.productId}{" "}
                  <ExternalLink size={12} />
                  {offer.listingStatus !== "reference"
                    ? ` (${offer.listingStatus})`
                    : ""}
                </a>
              ))}
            </div>
            {product.category !== "tool" && (
              <details>
                <summary>
                  {check.compatible
                    ? "Dimensions/pack compatible · human confirmation required"
                    : "Not automatically interchangeable with selected stock"}
                </summary>
                <ul>
                  {check.issues.map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
                <p>{check.note}</p>
              </details>
            )}
            {product.discrepancies.length > 0 && (
              <ul className="small-note">
                {product.discrepancies.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
            <details>
              <summary>Specification sources</summary>
              {product.sources.map((source) => (
                <p className="small-note" key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    Source <ExternalLink size={11} />
                  </a>{" "}
                  · {source.note}
                </p>
              ))}
            </details>
          </article>
        );
      })}
    </div>
  );
}
