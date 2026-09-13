# QA functional gap completion 029

No database migration is required for this batch.

1. Run `npm run verify`.
2. Open New Purchase Order and confirm products can be searched and added by clicking product cards.
3. Complete a POS sale and confirm the receipt page opens with the browser print dialog.
4. Sign in as a cashier and confirm non-POS pages redirect to POS Billing.
5. Receive a purchase order, create its Supplier Bill, and confirm Supplier Outstanding increases. A purchase order by itself must not create an accounting payable.

Existing held bills, sales history, percentage and fixed discounts, and return processing remain available under POS.
