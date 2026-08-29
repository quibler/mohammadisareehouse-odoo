# POS Receipt Total Qty Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the total item quantity in the POS receipt's TOTAL row, between the "Total" label and the amount.

**Architecture:** Single-file change to the existing OWL/QWeb template override (`order_receipt.xml`) that already customizes `point_of_sale.OrderReceipt`. Sum `qty` across `props.data.orderlines`, excluding discount lines, and render it as a third flex column alongside the existing label/amount columns using the same Arabic-numeral helper (`convertToArabicNumeralsOnly`) already used elsewhere in the file.

**Tech Stack:** Odoo 18 POS frontend, OWL templates (QWeb XML), no build step — served directly from the mounted addons volume. No automated test framework exists for this repo (per `CLAUDE.md`: no local dev server, verification happens by deploying and checking behavior).

## Global Constraints

- Qty must exclude lines where `line.isDiscountProduct` is true.
- Qty is always a whole number (per user confirmation) — use `Math.trunc`.
- Arabic numeral shown in brackets next to the English number, e.g. `5 (٥)`, using the existing `convertToArabicNumeralsOnly` helper — do not write a new conversion helper.
- Layout: three columns in the TOTAL row — label (left), qty (center), amount (right) — via `d-flex justify-content-between`, matching the existing row's flex pattern.
- No local dev server exists; verification is manual after deploying to the container (per `CLAUDE.md` restart/update commands).

---

### Task 1: Add total qty to the POS receipt TOTAL row

**Files:**
- Modify: `pos_kuwait_retail/static/src/overrides/components/order_receipt/order_receipt.xml:129-141`

**Interfaces:**
- Consumes: `props.data.orderlines` (array of line objects, each with `.qty` (number) and `.isDiscountProduct` (boolean) — already used elsewhere in this same file, e.g. line 93, 104), `convertToArabicNumeralsOnly` (template-scope helper function, already used at lines 107/114/121, takes a string and returns Arabic-numeral string).
- Produces: nothing consumed by other tasks — this is the only task.

- [ ] **Step 1: Read the current TOTAL section to confirm line numbers haven't shifted**

Run: `sed -n '125,145p' pos_kuwait_retail/static/src/overrides/components/order_receipt/order_receipt.xml`

Expected: Output shows the `<!-- TOTAL -->` comment followed by the `d-flex justify-content-between` div containing the label `<strong>` and amount `<strong>`, matching the block below (line numbers may differ slightly if the file changed since this plan was written — locate the block by the `<!-- TOTAL -->` comment instead of trusting exact line numbers if they don't match).

- [ ] **Step 2: Replace the TOTAL block with the three-column version**

Replace this existing block:

```xml
                <!-- TOTAL -->
                <div class="receipt-section border-top border-dark">
                    <div class="d-flex justify-content-between">
                        <strong>
                            <t t-out="props.data.label_total or 'Total:'"/>
                        </strong>
                        <strong>
                            <t t-set="taxTotals" t-value="props.data.taxTotals"/>
                            <t t-if="taxTotals" t-esc="formatCurrency(taxTotals.order_sign * taxTotals.order_total)"/>
                            <t t-else="" t-esc="formatCurrency(props.data.total_with_tax)"/>
                        </strong>
                    </div>
                </div>
```

With:

```xml
                <!-- TOTAL -->
                <div class="receipt-section border-top border-dark">
                    <div class="d-flex justify-content-between">
                        <strong>
                            <t t-out="props.data.label_total or 'Total:'"/>
                        </strong>
                        <strong>
                            <t t-set="totalQty" t-value="props.data.orderlines.filter((l) =&gt; !l.isDiscountProduct).reduce((sum, l) =&gt; sum + Math.trunc(l.qty), 0)"/>
                            <t t-esc="totalQty"/> (<t t-esc="convertToArabicNumeralsOnly(totalQty.toString())"/>)
                        </strong>
                        <strong>
                            <t t-set="taxTotals" t-value="props.data.taxTotals"/>
                            <t t-if="taxTotals" t-esc="formatCurrency(taxTotals.order_sign * taxTotals.order_total)"/>
                            <t t-else="" t-esc="formatCurrency(props.data.total_with_tax)"/>
                        </strong>
                    </div>
                </div>
```

Note: `&gt;` is the XML-escaped form of `>` — required inside the `t-value` attribute string since raw `>` is invalid in an XML attribute value. Use `Edit` with the exact string (including `&gt;`), not a literal `>`.

- [ ] **Step 3: Verify the file is well-formed XML**

Run: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('pos_kuwait_retail/static/src/overrides/components/order_receipt/order_receipt.xml')"`

Expected: No output, no exception (exit code 0). If it raises `ParseError`, the `&gt;` escaping or tag nesting is wrong — fix before proceeding.

- [ ] **Step 4: Deploy to the running container**

Run (adjust if working against local Docker Desktop container vs. EC2 — see `CLAUDE.md`):

```bash
docker compose restart web
```

Expected: Container restarts cleanly; `docker compose logs -f web` shows Odoo boot completing with no tracebacks (Ctrl-C to stop following once you see the "Odoo version" / HTTP service startup lines).

- [ ] **Step 5: Manually verify in the POS UI**

1. Open the POS session in a browser, add at least two different products with different quantities (e.g. qty 2 and qty 3) to an order, and if the setup has a discount product, add that too.
2. Complete/pay the order and open the receipt preview (or print preview).
3. Confirm the TOTAL row now shows three parts: `Total:` on the left, the summed qty (e.g. `5 (٥)`) in the middle, and the amount on the right.
4. Confirm the discount line's qty (if one was added) was **not** included in the summed qty.
5. Confirm layout doesn't overflow/wrap awkwardly on a narrow (58mm/80mm) receipt width if the POS is configured for thermal printing — check the print preview specifically, not just the on-screen popup.

Expected: All checks pass. If qty is wrong, re-check `isDiscountProduct` filtering; if layout breaks, adjust column widths/flex-basis in a follow-up step (not expected to be needed given `justify-content-between` matches the existing pattern already used in this row).

- [ ] **Step 6: Commit**

```bash
git add pos_kuwait_retail/static/src/overrides/components/order_receipt/order_receipt.xml
git commit -m "feat(pos_kuwait_retail): show total qty in receipt TOTAL row"
```
