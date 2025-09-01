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
        string='Net Stock Picking Count',
        compute='_compute_auto_stock_picking_count',
        help="Net count of stock pickings: +1 for incoming, -1 for outgoing/returns"
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

    # Discrepancy tracking - now with smart auto-resolution
    has_stock_discrepancy = fields.Boolean(
        string='Has Stock Discrepancy',
        compute='_compute_has_stock_discrepancy',
        store=True,
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

    @api.depends('auto_stock_picking_ids', 'auto_stock_picking_ids.state', 'auto_stock_picking_ids.picking_type_id.code')
    def _compute_auto_stock_picking_count(self):
        """Compute net stock picking count: +1 for IN, -1 for OUT/returns"""
        for record in self:
            count = 0
            for picking in record.auto_stock_picking_ids.filtered(lambda p: p.state != 'cancel'):
                if picking.picking_type_id.code == 'incoming':
                    count += 1
                elif picking.picking_type_id.code == 'outgoing':
                    count -= 1
            record.auto_stock_picking_count = count

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

    @api.depends('auto_stock_picking_ids', 'auto_stock_picking_ids.state', 'auto_stock_picking_ids.return_id')
    def _compute_has_stock_discrepancy(self):
        """Auto-clear discrepancy flag when all but most recent picking are returned"""
        for record in self:
            if not record.auto_stock_picking_ids:
                record.has_stock_discrepancy = False
                continue
                
            # Get all done pickings sorted by creation date (newest first)
            done_pickings = record.auto_stock_picking_ids.filtered(
                lambda p: p.state == 'done' and p.picking_type_id.code == 'incoming'
            ).sorted('create_date', reverse=True)
            
            if len(done_pickings) <= 1:
                # Only one or no pickings - no discrepancy possible
                record.has_stock_discrepancy = False
                continue
            
            # Check if all previous pickings (except most recent) are returned
            most_recent = done_pickings[0]
            previous_pickings = done_pickings[1:]
            
            all_previous_returned = True
            for picking in previous_pickings:
                if not record._has_return_picking(picking):
                    all_previous_returned = False
                    break
            
            if all_previous_returned:
                # All previous pickings are returned - clear discrepancy
                record.has_stock_discrepancy = False
                # Also clear the details
                if record.stock_discrepancy_details:
                    record.stock_discrepancy_details = False
                    # Post a message about auto-resolution
                    record.message_post(
                        body="""✅ Stock discrepancy automatically resolved

All previous stock pickings have been returned (manually or automatically), leaving only the most recent picking active. The discrepancy has been automatically cleared.""",
                        message_type='comment',
                        subtype_xmlid='mail.mt_note'
                    )
            else:
                # Keep existing discrepancy flag if it was set
                # This preserves manual discrepancy detection from content changes
                pass