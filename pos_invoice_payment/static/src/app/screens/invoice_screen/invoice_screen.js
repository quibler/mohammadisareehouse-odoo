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
            console.error("Error loading invoices:", error);
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

        // Get or create current order
        let currentOrder = this.pos.get_order();

        // If no order exists, create one
        if (!currentOrder) {
            this.pos.add_new_order();
            currentOrder = this.pos.get_order();
        }

        // Store invoice payment data in the order
        currentOrder.invoicePaymentData = {
            invoice_id: invoice.id,
            invoice_name: invoice.name,
            partner_id: invoice.partner_id,
            partner_name: invoice.partner_name,
            amount_due: invoice.amount_residual,
            amount_total: invoice.amount_total,
            amount_paid: invoice.amount_paid,
            currency_symbol: invoice.currency_symbol,
        };

        // Navigate to payment screen with order UUID
        this.pos.showScreen("PaymentScreen", { orderUuid: currentOrder.uuid });
    }

    back() {
        this.pos.showScreen("ProductScreen");
    }
}

registry.category("pos_screens").add("InvoiceScreen", InvoiceScreen);
