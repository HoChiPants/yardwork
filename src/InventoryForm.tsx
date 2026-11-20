import { useState } from "react";
import { retailerFromUrl, retailerName, type Retailer } from "./retailers";
import { CheckCircle2, Info } from "lucide-react";
import { shoppingOfferForMaterial } from "./retailerCatalog";
import {
  catalog,
  inventorySchema,
  material,
  type Inventory,
  type MaterialId,
  type Project,
} from "./model";
export function InventoryForm({
  project,
  target,
  onSave,
}: {
  project: Project;
  target?: MaterialId;
  onSave: (entry: Inventory) => void;
}) {
  const initial = material(target ?? "stud");
  const offer = target ? shoppingOfferForMaterial(initial, "home-depot")?.offer : undefined;
  const [retailer, setRetailer] = useState<Retailer>(
    project.retailer ?? "home-depot",
  );
  const [materialId, setMaterialId] = useState<MaterialId>(initial.id);
  const [name, setName] = useState(initial.name),
    [url, setUrl] = useState(offer?.url ?? ""),
    [internetNumber, setInternetNumber] = useState(offer?.productId ?? "");
  const [price, setPrice] = useState(""),
    [available, setAvailable] = useState(""),
    [store, setStore] = useState(project.store),
    [zip, setZip] = useState(project.zip);
  const [checkedAt, setCheckedAt] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16),
  );
  const [matched, setMatched] = useState(false),
    [error, setError] = useState("");
  const stock = material(materialId);
  const reference = shoppingOfferForMaterial(stock, retailer);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          const entry = inventorySchema.parse({
            retailer,
            material: materialId,
            name,
            url,
            internetNumber,
            price: Number(price),
            available: Number(available),
            store,
            zip,
            checkedAt: new Date(checkedAt).toISOString(),
          });
          if (!matched)
            throw Error(
              "Confirm that the product matches the modeled stock dimensions.",
            );
          onSave(entry);
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Check the snapshot fields.",
          );
        }
      }}
    >
      <h2 id="modal-title">Record a store snapshot.</h2>
      <p className="small-note">
        Copy values you checked at the retailer. This records your observations;
        it does not contact either retailer to verify stock.
      </p>
      <label className="field">
        Retailer
        <select
          aria-label="Snapshot retailer"
          value={retailer}
          disabled={!!target}
          onChange={(e) => {
            setRetailer(e.target.value as Retailer);
            setStore("");
            setMatched(false);
            setUrl("");
            setInternetNumber("");
          }}
        >
          <option value="home-depot">Home Depot</option>
          <option value="lowes">Lowe's</option>
        </select>
      </label>
      <label className="field">
        Modeled material
        <select
          value={materialId}
          disabled={!!target}
          onChange={(e) => {
            const id = e.target.value as MaterialId;
            setMaterialId(id);
            setName(material(id).name);
            setMatched(false);
            setUrl("");
            setInternetNumber("");
          }}
        >
          {catalog.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {(reference || stock.productReference) && (
        <div className="notice">
          <div>
            {reference ? (
              <>
                <strong>
                  {reference.suggested
                    ? "Suggested regional listing"
                    : "Exact product reference"}
                  {" · "}
                  {reference.offer.productId}
                </strong>
                <p>
                  {stock.subtitle}. Record observations for one {stock.unit}{" "}
                  purchase unit.{" "}
                  {reference.suggested &&
                    "Confirm grade, species and treatment."}
                </p>
                {!target && <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setUrl(reference.offer.url);
                    setInternetNumber(reference.offer.productId);
                    setName(stock.name);
                    setMatched(false);
                  }}
                >
                  {reference.suggested
                    ? "Use suggested listing"
                    : "Use reviewed product reference"}
                </button>}
              </>
            ) : (
              <p>
                No current reviewed offer for this exact modeled product at{" "}
                {retailerName(retailer)}. Select its reviewed retailer or
                another material.
              </p>
            )}
          </div>
        </div>
      )}
      <label className="field">
        Product name
        <input
          required
          maxLength={240}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="field">
        {retailerName(retailer)} product URL
        <input
          required
          type="url"
          placeholder={
            retailer === "lowes"
              ? "https://www.lowes.com/pd/…/1114951"
              : "https://www.homedepot.com/p/…/123456789"
          }
          value={url}
          readOnly={!!target}
          onChange={(e) => {
            setUrl(e.target.value);
            const detected = retailerFromUrl(e.target.value);
            if (detected && detected !== retailer) {
              setRetailer(detected);
              setStore("");
              setMatched(false);
            }
            const id = e.target.value.match(/\/(\d{3,16})(?:[/?#]|$)/)?.[1];
            if (id) setInternetNumber(id);
          }}
        />
      </label>
      <label className="field">
        {retailer === "lowes" ? "Retailer product number" : "Internet number"}
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{3,16}"
          value={internetNumber}
          readOnly={!!target}
          onChange={(e) => setInternetNumber(e.target.value)}
        />
      </label>
      <div className="two-col">
        <label className="field">
          Unit price (USD)
          <input
            required
            type="number"
            min="0"
            max="100000"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </label>
        <label className="field">
          Available stock units
          <input
            required
            type="number"
            min="0"
            step="1"
            value={available}
            onChange={(e) => setAvailable(e.target.value)}
          />
        </label>
      </div>
      <div className="two-col">
        <label className="field">
          Exact store number
          <input
            required
            maxLength={80}
            value={store}
            placeholder="Retailer's store ID"
            onChange={(e) => setStore(e.target.value)}
          />
        </label>
        <label className="field">
          Store ZIP code
          <input
            required
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        Time checked (your local time)
        <input
          required
          type="datetime-local"
          value={checkedAt}
          onChange={(e) => setCheckedAt(e.target.value)}
        />
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={matched}
          onChange={(e) => setMatched(e.target.checked)}
        />
        <span>
          I matched the product to{" "}
          <strong>{material(materialId).subtitle}</strong> and the{" "}
          <strong>{material(materialId).unit}</strong> purchase unit.
        </span>
      </label>
      <div className="notice">
        <Info size={16} />
        <p>
          Saving selects store {store || "…"} in ZIP {zip}. Snapshots expire
          after 24 hours. Quantities remain estimates until confirmed at
          purchase.
        </p>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button primary full" type="submit">
        <CheckCircle2 size={15} />
        Save snapshot
      </button>
    </form>
  );
}
