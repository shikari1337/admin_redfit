# AUTOSHIP-FILE-1: ship processed orders from a file, cheapest courier (owner, 27 Nov 2026)

Owner: "in admin panel add option to upload csv file with order number for order processed and generated invoice
number and shipping dimension and volume and box id, weight dimension or box id is enough, to process and autoship
order from whatever courier option is cheaper among growcord ship or shiprocket with option to deselect courier like
india post or other (make sure growship quotes rates are compared including entered commission)".

## What exists (looked first, reused, nothing copied)
- Rates: `shippingAPI.getCourierRates(orderId, warehouseId, {weight, length, breadth, height}, provider)` for
  `growcord_ship` and `shiprocket` (the store's own account); `courierRatesOf` reads both
  (`components/order/ShipmentCreationModal.tsx`). Growcord Ship's rate is the STORE price: cost plus the commission
  set for the store, GST and COD fee included, and the own-Shiprocket undercut rule already applied
  (`growcord-rs apps/ship/core/src/domain/rate.rs` `quote`, `own_panel_prices`). Shiprocket's rate is its total as
  displayed. Both are compared as the total the store pays.
- Booking: `shippingAPI.createShipment(orderId, {provider, courier, box, weight, dims})`, bookable statuses
  confirmed and processing (`pages/growship/Bulk.tsx` BOOKABLE); live-parcel check `shipmentsAPI.byOrder`.
- Boxes: `packagesAPI.getAll()` (the store's box list: dimensions, dead weight); order weight as the bulk page works
  it out (`weighOrder`, `itemUnitWeightKg`).
- Invoice: `invoicesAPI.saveDetails(orderId, {invoiceNumber, invoiceDate})` stores the number the store's own
  accounting issued (refuses a number another order holds, growcord-rs ebb209f5); `ordersAPI.issueInvoice(id)`
  issues the next Growcord number, idempotent.
- Ship's own allocation rule already excludes couriers for Growcord Ship (`ship_allocation_rules.exclusions`).

## The file (template downloadable on the page)
`Order Number` (required), `Invoice Number`, `Invoice Date`, `Box` (box id or box name), `Weight (kg)`,
`Length (cm)`, `Breadth (cm)`, `Height (cm)`. A row needs a box, or weight with all three sides. A box with no weight
typed takes the order's worked-out weight (never under the box's own dead weight).

## The page: Orders, Ship from a file
1. Choose the file, the pickup warehouse, and the couriers allowed (every courier both sources answer, ticked; untick
   India Post or any other; the choice is remembered for this store on this browser).
2. Check (nothing written): per row the order found, its state, the invoice it will carry, the parcel, the cheapest
   allowed courier with its source and price, the next cheapest and the saving, or the reason it cannot ship
   (not found, already shipped, cancelled, on hold, no allowed courier, COD order with no COD courier, bad size).
3. Ship: per row in order, invoice first (the file's number saved, else a Growcord number issued), then the booking
   with the chosen offer. A row that fails stops only itself. Results with AWB, courier, price; download as CSV.
Never books an order twice: a row whose order already has a live parcel is skipped, and a run's rows are not sent
again from the page.

## Out of scope here
The margin is never shown (the store sees its price only). No backend change: every call exists and is live.
