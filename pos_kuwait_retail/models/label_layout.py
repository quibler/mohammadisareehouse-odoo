import logging

from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class ProductLabelLayout(models.TransientModel):
    _inherit = 'product.label.layout'

    @api.model
    def default_get(self, fields_list):
        res = super().default_get(fields_list)

        res['print_format'] = 'dymo'

        product_tmpl_ids = self.env.context.get('default_product_tmpl_ids', [])
        product_ids = self.env.context.get('default_product_ids', [])

        if product_tmpl_ids and 'custom_quantity' in fields_list:
            templates = self.env['product.template'].browse(product_tmpl_ids)
            products = templates.mapped('product_variant_ids')
            total_quantity = self._get_total_quantity_from_latest_bills(products)
            if total_quantity > 0:
                res['custom_quantity'] = total_quantity

        elif product_ids and 'custom_quantity' in fields_list:
            products = self.env['product.product'].browse(product_ids)
            total_quantity = self._get_total_quantity_from_latest_bills(products)
            if total_quantity > 0:
                res['custom_quantity'] = total_quantity

        return res

    @api.model_create_multi
    def create(self, vals_list):
        """Force dymo on create - properly handles batch creation"""
        # Handle both single dict and list of dicts for backward compatibility
        if isinstance(vals_list, dict):
            vals_list = [vals_list]

        # Force dymo format for all records
        for vals in vals_list:
            vals['print_format'] = 'dymo'

        return super().create(vals_list)

    def write(self, vals):
        """Force dymo on write"""
        vals['print_format'] = 'dymo'
        return super().write(vals)

    def _get_total_quantity_from_latest_bills(self, products):
        """Calculate total quantity for products from latest vendor bills.

        Uses a single SQL query instead of nested ORM loops to avoid
        O(products × bills) query storms that peg CPU on large catalogs.
        """
        if not products:
            return 0

        # DISTINCT ON (product_id) gives the row with the highest (date, id)
        # per product — i.e. the most recent posted vendor bill line.
        self.env.cr.execute("""
            SELECT aml.product_id, aml.quantity
            FROM account_move_line aml
            JOIN account_move am ON am.id = aml.move_id
            WHERE am.move_type = 'in_invoice'
              AND am.state = 'posted'
              AND aml.product_id = ANY(%s)
              AND aml.quantity > 0
            ORDER BY aml.product_id, am.date DESC, am.id DESC, aml.id DESC
        """, [products.ids])

        # Keep only the first (latest) row per product
        seen = set()
        total_quantity = 0
        for product_id, quantity in self.env.cr.fetchall():
            if product_id not in seen:
                seen.add(product_id)
                total_quantity += int(quantity)

        _logger.info(f"Total calculated quantity from latest bills: {total_quantity}")
        return total_quantity