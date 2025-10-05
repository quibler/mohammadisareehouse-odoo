import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { _t } from "@web/core/l10n/translation";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { Component, useState, onMounted } from "@odoo/owl";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { CenteredIcon } from "@point_of_sale/app/generic_components/centered_icon/centered_icon";

export class InvoiceScreen extends Component {
    static template = "pos_invoice_payment.InvoiceScreen";
    static components = { CenteredIcon };
    static props = {};

    setup() {
        this.pos = usePos();
        this.orm = useService("orm");
        this.dialog = useService("dialog");
        this.notification = useService("notification");
        this.ui = useState(useService("ui"));

        this.state = useState({
            invoices: [],
            selectedInvoice: null,
            searchTerm: "",
            filterState: "unpaid_partial", // 'all', 'not_paid', 'partial', 'unpaid_partial'
            loading: false,
        });

        onMounted(() => {
            this.pos.invoice_screen_mobile_pane = "left";
            this.loadInvoices();
        });
    }

    switchPane() {
        this.pos.invoice_screen_mobile_pane = this.pos.invoice_screen_mobile_pane === "left" ? "right" : "left";
    }

    async loadInvoices() {
        this.state.loading = true;
        try {
            const invoices = await this.orm.call(
                "pos.invoice.payment",
                "get_customer_invoices",
                [this.state.searchTerm || null, this.state.filterState]
            );
            this.state.invoices = invoices;

            // If we had a selected invoice, try to keep it selected
            if (this.state.selectedInvoice) {
                const stillExists = invoices.find(inv => inv.id === this.state.selectedInvoice.id);
                if (stillExists) {
                    this.state.selectedInvoice = stillExists;
                } else {
                    this.state.selectedInvoice = null;
                }
            }
        } catch (error) {
            this.dialog.add(AlertDialog, {
                title: _t("Error"),
                body: _t("Failed to load invoices: ") + error.message,
            });
        } finally {
            this.state.loading = false;
        }
    }

    async onSearch(searchTerm) {
        this.state.searchTerm = searchTerm;
        await this.loadInvoices();
    }

    async onFilterChange(filterState) {
        this.state.filterState = filterState;
        await this.loadInvoices();
    }

    selectInvoice(invoice) {
        this.state.selectedInvoice = invoice;
        if (this.ui.isSmall) {
            this.pos.invoice_screen_mobile_pane = "right";
        }
    }

    get selectedInvoice() {
        return this.state.selectedInvoice;
    }

    get filteredInvoices() {
        return this.state.invoices;
    }

    getPaymentStateBadgeClass(paymentState) {
        const classes = {
            'not_paid': 'text-bg-danger',
            'partial': 'text-bg-warning',
            'paid': 'text-bg-success',
            'in_payment': 'text-bg-info',
        };
        return classes[paymentState] || 'text-bg-secondary';
    }

    getPaymentStateLabel(paymentState) {
        const labels = {
            'not_paid': _t('Unpaid'),
            'partial': _t('Partial'),
            'paid': _t('Paid'),
            'in_payment': _t('In Payment'),
        };
        return labels[paymentState] || paymentState;
    }

    formatCurrency(amount) {
        return this.pos.env.utils.formatCurrency(amount);
    }

    formatDate(dateStr) {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        return date.toLocaleDateString();
    }

    async onPayInvoice() {
        if (!this.state.selectedInvoice) {
            return;
        }

        const invoice = this.state.selectedInvoice;

        if (invoice.amount_residual <= 0) {
            this.dialog.add(AlertDialog, {
                title: _t("Cannot Pay"),
                body: _t("This invoice is already fully paid."),
            });
            return;
        }

        // Find the "Invoice Payment" product
        const invoicePaymentProduct = this._findInvoicePaymentProduct();
        if (!invoicePaymentProduct) {
            this.dialog.add(AlertDialog, {
                title: _t("Configuration Error"),
                body: _t("Invoice Payment product not found. Please create a service product named 'Invoice Payment' and make it available in POS."),
            });
            return;
        }

        // Save reference to the current order before creating invoice payment order
        const originalOrder = this.pos.get_order();

        // Create a dedicated temporary order specifically for invoice payment
        // This isolates invoice payments from regular POS orders
        const invoicePaymentOrder = this.pos.add_new_order();

        // Mark this order as an invoice payment order (flag for identification)
        invoicePaymentOrder.isInvoicePaymentOrder = true;

        // Store the original order reference so we can restore it later
        invoicePaymentOrder.originalOrder = originalOrder;

        // Store invoice payment data in this dedicated order
        invoicePaymentOrder.invoicePaymentData = {
            invoice_id: invoice.id,
            invoice_name: invoice.name,
            invoice_origin: invoice.invoice_origin,
            partner_id: invoice.partner_id,
            partner_name: invoice.partner_name,
            amount_due: invoice.amount_residual,
            amount_total: invoice.amount_total,
            amount_paid: invoice.amount_paid,
            currency_symbol: invoice.currency_symbol,
        };

        // Set customer if available
        if (invoice.partner_id) {
            const partner = this.pos.models['res.partner'].get(invoice.partner_id);
            if (partner) {
                invoicePaymentOrder.set_partner(partner);
            }
        }

        // Set this order as the active order (following refund pattern)
        this.pos.set_order(invoicePaymentOrder);

        // Add product line representing the invoice amount
        try {
            await this.pos.addLineToCurrentOrder(
                {
                    product_id: invoicePaymentProduct,
                    price_unit: invoice.amount_residual,
                    qty: 1,
                },
                {},
                false // Don't configure
            );

            // Update the line's product name to be more descriptive
            const line = invoicePaymentOrder.get_last_orderline();
            if (line) {
                line.set_full_product_name(`Payment for ${invoice.name}`);
            }
        } catch (error) {
            this.dialog.add(AlertDialog, {
                title: _t("Error"),
                body: _t("Failed to create invoice payment order: ") + error.message,
            });
            // Remove the temporary order and restore original
            this.pos.removeOrder(invoicePaymentOrder);
            if (originalOrder) {
                this.pos.set_order(originalOrder);
            }
            return;
        }

        // Navigate to payment screen with the dedicated order UUID
        this.pos.showScreen("PaymentScreen", { orderUuid: invoicePaymentOrder.uuid });
    }

    _findInvoicePaymentProduct() {
        // Try to find "Invoice Payment" product by name
        const allProducts = this.pos.models["product.product"].getAll();

        // Method 1: Exact match "Invoice Payment"
        let product = allProducts.find(p =>
            p.name && p.name.toLowerCase() === 'invoice payment'
        );
        if (product) return product;

        // Method 2: Contains "invoice payment"
        product = allProducts.find(p =>
            p.name && p.name.toLowerCase().includes('invoice payment')
        );
        if (product) return product;

        // Method 3: Any service product with "payment" in the name
        product = allProducts.find(p =>
            p.detailed_type === 'service' &&
            p.name && p.name.toLowerCase().includes('payment')
        );
        if (product) return product;

        return null;
    }

    back() {
        this.pos.showScreen("ProductScreen");
    }
}

registry.category("pos_screens").add("InvoiceScreen", InvoiceScreen);
