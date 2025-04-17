from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    salesperson_id = fields.Many2one(
        'hr.employee',
        string='Salesperson',
        help='Employee who assisted the customer and made this sale',
        tracking=True,
    )

    @api.model
    def _order_fields(self, ui_order):
        """Add salesperson_id to the order fields coming from the UI."""
        order_fields = super(PosOrder, self)._order_fields(ui_order)

        if 'salesperson_id' in ui_order:
            order_fields['salesperson_id'] = ui_order['salesperson_id']

        return order_fields


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_hr_employee(self):
        """Add salesperson field to the loaded fields for employees."""
        result = super()._loader_params_hr_employee()
        result['search_params']['domain'].append(('department_id.name', 'in', ['Sales', 'Retail', 'Shop']))
        if 'fields' in result:
            result['fields'].extend(['name', 'department_id'])
        return result