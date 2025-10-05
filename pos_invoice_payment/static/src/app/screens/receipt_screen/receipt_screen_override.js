import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";
import { patch } from "@web/core/utils/patch";

patch(ReceiptScreen.prototype, {
    get orderAmountPlusTip() {
        // For invoice payments, show actual payment amount (not order total)
        if (this.currentOrder?.isInvoicePaymentOrder) {
            const actualPayment = this.currentOrder.get_total_paid();
            return this.env.utils.formatCurrency(actualPayment);
        }

        // Default behavior for normal orders
        return super.orderAmountPlusTip;
    },

    get nextScreen() {
        // If this is an invoice payment order, return to InvoiceScreen instead of ProductScreen
        if (this.currentOrder?.isInvoicePaymentOrder) {
            return { name: "InvoiceScreen" };
        }

        // Default behavior for normal orders
        return super.nextScreen;
    },

    orderDone() {
        const currentOrder = this.currentOrder;

        // If this is an invoice payment order, clean it up
        if (currentOrder?.isInvoicePaymentOrder) {
            // Save reference to original order before removing current one
            const originalOrder = currentOrder.originalOrder;

            // Remove the invoice payment order
            this.pos.removeOrder(currentOrder);

            // Restore the original order if it still exists
            if (originalOrder && this.pos.get_open_orders().includes(originalOrder)) {
                this.pos.set_order(originalOrder);
            } else {
                // Original order doesn't exist anymore, ensure we have a regular order
                const openOrders = this.pos.get_open_orders();
                if (openOrders.length === 0) {
                    this.pos.add_new_order();
                } else {
                    const regularOrder = openOrders.find(o => !o.isInvoicePaymentOrder);
                    if (regularOrder) {
                        this.pos.set_order(regularOrder);
                    } else {
                        this.pos.add_new_order();
                    }
                }
            }

            // Reset search
            this.pos.searchProductWord = "";

            // Navigate to InvoiceScreen
            this.pos.showScreen("InvoiceScreen");
        } else {
            // Default behavior for normal orders
            return super.orderDone(...arguments);
        }
    },
});
