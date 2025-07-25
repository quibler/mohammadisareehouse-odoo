/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";
import { makeAwaitable, ask } from "@point_of_sale/app/store/make_awaitable_dialog";

export class SalesPersonButton extends Component {
    static template = "pos_kuwait_retail.SalesPersonButton";
    static props = {};

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        console.log('SalesPersonButton setup completed');
    }

    get currentOrder() {
        const order = this.pos.get_order();
        console.log('currentOrder getter called, order:', order);
        return order;
    }

    get isLocked() {
        console.log('isLocked getter called');
        const order = this.currentOrder;
        if (!order) {
            console.log('No order found');
            return false;
        }

        console.log('Order details:', {
            amount_total: order.amount_total,
            sales_person_id: order.sales_person_id,
            getSalesPerson: order.getSalesPerson ? order.getSalesPerson() : 'No getSalesPerson method'
        });

        // Check if this is a refund order (negative amount_total indicates refund)
        const isRefund = order.amount_total < 0;

        // Check if the order has a sales person assigned
        const hasSalesPerson = order.sales_person_id;

        console.log('Lock check result:', { isRefund, hasSalesPerson });

        return isRefund && hasSalesPerson;
    }

    _prepareEmployeeList(currentSalesPerson) {
        // In Odoo 18, use the new models API
        // Try multiple approaches to get employees
        let allEmployees = [];

        try {
            // Method 1: Try the new orderedRecords property
            if (this.pos.models["hr.employee"] && this.pos.models["hr.employee"].orderedRecords) {
                allEmployees = this.pos.models["hr.employee"].orderedRecords;
            }
            // Method 2: Try the records property and convert to array
            else if (this.pos.models["hr.employee"] && this.pos.models["hr.employee"].records) {
                allEmployees = Array.from(this.pos.models["hr.employee"].records.values());
            }
            // Method 3: Check if it's an array directly
            else if (Array.isArray(this.pos.models["hr.employee"])) {
                allEmployees = this.pos.models["hr.employee"];
            }
            // Method 4: Try accessing data property
            else if (this.pos.models["hr.employee"] && this.pos.models["hr.employee"].data) {
                allEmployees = this.pos.models["hr.employee"].data;
            }
            // Method 5: Fallback to pos.employees if available
            else if (this.pos.employees) {
                allEmployees = this.pos.employees;
            }
            // Method 6: Last resort - try to get from pos data
            else if (this.pos.data && this.pos.data.employees) {
                allEmployees = this.pos.data.employees;
            }
        } catch (error) {
            console.error('Error accessing employees:', error);
            allEmployees = [];
        }

        console.log('All employees found:', allEmployees);

        // Get the allowed employee IDs
        let allowedEmployeeIds = [];
        if (this.pos.config.sales_person_ids && Array.isArray(this.pos.config.sales_person_ids)) {
            // Extract IDs from the objects/Proxy objects
            allowedEmployeeIds = Array.from(this.pos.config.sales_person_ids).map(emp => {
                return typeof emp === 'object' ? emp.id : emp;
            });
        }

        console.log('Allowed employee IDs:', allowedEmployeeIds);

        // Filter employees that are in the allowed list
        let employeesToShow = allEmployees;
        if (allowedEmployeeIds.length > 0) {
            employeesToShow = allEmployees.filter(
                (employee) => allowedEmployeeIds.includes(employee.id)
            );
        }

        console.log('Employees to show:', employeesToShow);

        const res = employeesToShow.map((employee) => {
            return {
                id: employee.id,
                item: employee,
                label: employee.name,
                isSelected: employee.id === currentSalesPerson,
            };
        });

        if (currentSalesPerson) {
            res.push({
                id: -1,
                item: {},
                label: "Clear",
                isSelected: false,
            });
        }

        return res;
    }

    async onClick() {
        console.log('SalesPersonButton clicked!');
        const order = this.currentOrder;

        if (!order) {
            console.log('No order in onClick');
            return;
        }

        console.log('Button clicked, isLocked:', this.isLocked);

        // Check if this is a refund order with inherited sales person - should be locked
        if (this.isLocked) {
            console.log('Showing lock dialog');
            await ask(this.dialog, {
                title: _t("Sales Person Locked"),
                body: _t("The sales person for this refund order is inherited from the original order and cannot be changed."),
            });
            return;
        }

        console.log('Proceeding with sales person selection');

        const employeesList = this._prepareEmployeeList(order.getSalesPerson()?.id);

        if (!employeesList.length) {
            await ask(this.dialog, {
                title: _t("No Sales Person"),
                body: _t("There are no sales persons available for this POS. Please configure allowed sales persons in the POS settings."),
            });
            return;
        }

        let sales_person = await makeAwaitable(this.dialog, SelectionPopup, {
            title: _t("Select Sales Person"),
            list: employeesList,
        });

        if (!sales_person) {
            return;
        }

        if (sales_person.id === -1){
            order.setSalesPerson(false);
        } else {
            order.setSalesPerson(sales_person);
        }
    }
}