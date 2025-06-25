from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = 'pos.order'

    sales_person_id = fields.Many2one(
        'hr.employee',
        string='Sales Person',
        help="Employee who handled this sale"
    )

    global_discount_type = fields.Selection([
        ('percentage', 'Percentage'),
        ('amount', 'Fixed Amount')
    ], string='Global Discount Type')

    global_discount_amount = fields.Float(
        string='Global Discount Amount',
        help="Fixed amount discount applied to the order"
    )

    global_discount_percentage = fields.Float(
        string='Global Discount Percentage',
        help="Percentage discount applied to the order"
    )

    @api.model
    def _prepare_fields_for_pos_list(self):
        """Add custom fields to POS order list"""
        fields = super()._prepare_fields_for_pos_list()
        fields.extend([
            'sales_person_id',
            'global_discount_type',
            'global_discount_amount',
            'global_discount_percentage'
        ])
        return fields

    @api.model
    def sync_from_ui(self, orders):
        """Override to handle sales person and custom discount data"""
        order_ids = super().sync_from_ui(orders)

        for order in orders:
            order_data = order.get('data', {})
            if order_data:
                existing_order = self.browse(order_ids).filtered(
                    lambda o: o.pos_reference == order_data.get('name')
                )
                if existing_order:
                    vals = {}

                    # Handle sales person
                    if order_data.get('sales_person_id'):
                        vals['sales_person_id'] = order_data['sales_person_id']

                    # Handle global discount
                    if order_data.get('global_discount_type'):
                        vals['global_discount_type'] = order_data['global_discount_type']

                        if order_data['global_discount_type'] == 'amount':
                            vals['global_discount_amount'] = order_data.get('global_discount_amount', 0.0)
                        elif order_data['global_discount_type'] == 'percentage':
                            vals['global_discount_percentage'] = order_data.get('global_discount_percentage', 0.0)

                    if vals:
                        existing_order.write(vals)

        return order_ids

    def _prepare_invoice_vals(self):
        """Add sales person to invoice"""
        vals = super()._prepare_invoice_vals()
        if self.sales_person_id:
            vals['sales_person_id'] = self.sales_person_id.id
        return vals


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    def _compute_amount_line_all(self):
        """Override to handle amount-based global discounts"""
        result = super()._compute_amount_line_all()

        for line in self:
            order = line.order_id
            if order.global_discount_type == 'amount' and order.global_discount_amount > 0:
                # Calculate proportional discount for this line
                order_total = sum(line.price_subtotal for line in order.lines)
                if order_total > 0:
                    line_proportion = line.price_subtotal / order_total
                    line_discount_amount = order.global_discount_amount * line_proportion

                    # Apply the discount to the line
                    line.price_subtotal_incl -= line_discount_amount
                    line.price_subtotal -= line_discount_amount

        return result