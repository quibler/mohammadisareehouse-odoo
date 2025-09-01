# -*- coding: utf-8 -*-
from odoo import api, fields, models


class AccountMoveFields(models.AbstractModel):
    """Mixin for AccountMove field definitions and basic computed fields"""
    _name = 'account.move.fields.mixin'
    _description = 'Account Move Fields Mixin'

    # Enhanced fields for auto stock functionality
    auto_stock_picking_ids = fields.One2many(
        'stock.picking',
        'vendor_bill_id',
        string='Auto Stock Pickings',
        readonly=True,
        help="Stock pickings automatically created from this vendor bill"
    )
    auto_stock_picking_count = fields.Integer(
        string='Stock Picking Count',
        compute='_compute_auto_stock_picking_count'
    )

    # Track if stock has been processed and content hash
    stock_processed_hash = fields.Char(
        string='Stock Processing Hash',
        readonly=True,
        help="Hash of bill content to track if stock has been processed"
    )
    stock_moves_created = fields.Boolean(
        string='Stock Moves Created',
        readonly=True,
        default=False,
        help="Indicates if automatic stock moves have been created for this bill"
    )

    # Discrepancy tracking
    has_stock_discrepancy = fields.Boolean(
        string='Has Stock Discrepancy',
        readonly=True,
        default=False,
        help="Indicates if there's a stock discrepancy that needs resolution"
    )
    stock_discrepancy_details = fields.Text(
        string='Stock Discrepancy Details',
        readonly=True,
        help="Details of the stock discrepancy"
    )

    # Total quantity of all products in the bill
    total_product_quantity = fields.Float(
        string='Total Product Quantity',
        compute='_compute_total_product_quantity',
        help="Total quantity of all products in this vendor bill"
    )

    @api.depends('auto_stock_picking_ids')
    def _compute_auto_stock_picking_count(self):
        for record in self:
            record.auto_stock_picking_count = len(record.auto_stock_picking_ids)

    @api.depends('invoice_line_ids.quantity')
    def _compute_total_product_quantity(self):
        """Compute total quantity of all products"""
        for move in self:
            total_qty = 0
            for line in move.invoice_line_ids:
                if (line.product_id and
                        line.product_id.type in ['product', 'consu'] and
                        line.quantity > 0 and
                        line.display_type == 'product'):
                    total_qty += line.quantity
            move.total_product_quantity = total_qty