import { useState } from "react";
import { CheckCircle2, Info } from "lucide-react";
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
  onSave,
}: {
  project: Project;
  onSave: (entry: Inventory) => void;
}) {
  const [materialId, setMaterialId] = useState<MaterialId>("stud");
  const [name, setName] = useState(material("stud").name),
    [url, setUrl] = useState(""),
    [internetNumber, setInternetNumber] = useState("");
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
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        try {
          const entry = inventorySchema.parse({
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
          if (Date.parse(entry.checkedAt) > Date.now() + 60000)
            throw Error("The check time cannot be in the future.");
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
        it does not verify stock with Home Depot.
      </p>
      <label className="field">
        Modeled material
        <select
          value={materialId}
          onChange={(e) => {
            const id = e.target.value as MaterialId;
            setMaterialId(id);
            setName(material(id).name);
            setMatched(false);
          }}
        >
          {catalog.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
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
        Home Depot product URL
        <input
          required
          type="url"
          placeholder="https://www.homedepot.com/p/…/123456789"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            const id = e.target.value.match(/\/(\d{6,12})(?:[/?#]|$)/)?.[1];
            if (id) setInternetNumber(id);
          }}
        />
      </label>
      <label className="field">
        Internet number
        <input
          required
          inputMode="numeric"
          pattern="[0-9]{6,12}"
          value={internetNumber}
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
