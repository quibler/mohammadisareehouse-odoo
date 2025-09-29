# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
from odoo.exceptions import UserError
import logging
import json

_logger = logging.getLogger(__name__)


class AccountMove(models.Model):
    _inherit = 'account.move'

    # Simple tracking field for differential stock processing
    stock_line_snapshot = fields.Text(
        string='Stock Processing Snapshot',
        readonly=True,
        help="JSON snapshot of stockable products for differential processing"
    )
    total_product_quantity = fields.Float(
        string='Total Product Quantity',
        compute='_compute_total_product_quantity',
        store=False,
        help="Total quantity of all stockable products in this vendor bill"
    )
    pos_order_general_note = fields.Text(
        string='POS General Note',
        compute='_compute_pos_order_general_note',
        store=False,
        help="General note from the related POS order"
    )

    @api.model
    def default_get(self, fields_list):
        """Set default dates for vendor bills"""
        defaults = super().default_get(fields_list)
        
        move_type = defaults.get('move_type') or self._context.get('default_move_type')
        
        if move_type in ('in_invoice', 'in_refund', 'in_receipt'):
            today = fields.Date.context_today(self)
            
            if 'invoice_date' in fields_list and not defaults.get('invoice_date'):
                defaults['invoice_date'] = today
                
            if 'date' in fields_list and not defaults.get('date'):
                defaults['date'] = today
                
        return defaults

    @api.depends('invoice_line_ids', 'invoice_line_ids.quantity', 'invoice_line_ids.product_id')
    def _compute_total_product_quantity(self):
        """Compute total quantity of all stockable products"""
        for move in self:
            total_qty = 0.0
            if move.move_type == 'in_invoice':
                for line in move._get_stockable_lines():
                    total_qty += line.quantity
            move.total_product_quantity = total_qty

    @api.depends('pos_order_ids', 'pos_order_ids.general_note')
    def _compute_pos_order_general_note(self):
        """Compute general note from related POS order"""
        for move in self:
            if move.pos_order_ids:
                # Get the general note from the first POS order
                move.pos_order_general_note = move.pos_order_ids[0].general_note or ''
            else:
                move.pos_order_general_note = ''

    def action_post(self):
        """Override to create stock movements automatically after posting vendor bills"""
        result = super().action_post()
        
        # Process vendor bills for automatic stock moves
        vendor_bills = self.filtered(lambda m: m._should_process_stock())
        
        for bill in vendor_bills:
            try:
                _logger.info(f"Processing stock moves and cost updates for bill {bill.name}")
                # Update product costs FIRST (affects stock valuation)
                bill._update_product_costs()
                # Then process stock moves
                bill._process_stock_moves()
            except Exception as e:
                _logger.error(f"Failed to process bill {bill.name}: {str(e)}")
                bill.message_post(
                    body=f"❌ Error processing vendor bill automation: {str(e)}",
                    message_type='comment',
                    subtype_xmlid='mail.mt_note'
                )
        
        return result

    def write(self, vals):
        """Handle invoice line changes with differential stock processing"""
        # Track if lines are being modified on posted bills
        lines_modified = 'invoice_line_ids' in vals
        posted_bills = self.filtered(lambda m: m.state == 'posted' and m.move_type == 'in_invoice')
        
        result = super().write(vals)
        
        # Process differential stock moves if lines changed on posted bills
        if lines_modified and posted_bills:
            for bill in posted_bills:
                try:
                    bill._process_stock_moves()
                    # Update product costs after stock moves
                    bill._update_product_costs()
                except Exception as e:
                    _logger.error(f"Failed to process stock changes for bill {bill.name}: {str(e)}")
                    bill.message_post(
                        body=f"❌ Error processing stock changes: {str(e)}",
                        message_type='comment',
                        subtype_xmlid='mail.mt_note'
                    )
        
        return result

    def _should_process_stock(self):
        """Check if this bill should have stock processing"""
        self.ensure_one()
        return (
            self.move_type == 'in_invoice' and 
            self.state == 'posted' and
            self._get_stockable_lines()
        )

    def _get_stockable_lines(self):
        """Get lines with stockable products"""
        self.ensure_one()
        return self.invoice_line_ids.filtered(
            lambda line: (
                line.product_id and
                line.product_id.type in ['product', 'consu'] and
                line.quantity > 0 and
                (line.display_type == 'product' or not line.display_type)
            )
        )

    def _get_current_stock_snapshot(self):
        """Get current stockable lines as a list for comparison"""
        lines = self._get_stockable_lines()
        return [
            {
                'product_id': line.product_id.id,
                'quantity': line.quantity,
                'price_unit': line.price_unit,
            }
            for line in lines.sorted('id')
        ]

    def _get_previous_stock_snapshot(self):
        """Get previous stockable lines snapshot from stored data"""
        if not self.stock_line_snapshot:
            return []
        try:
            return json.loads(self.stock_line_snapshot)
        except (json.JSONDecodeError, TypeError):
            return []

    def _calculate_stock_differences(self):
        """Calculate what stock moves are needed based on line changes"""
        current_lines = {
            line['product_id']: line 
            for line in self._get_current_stock_snapshot()
        }
        previous_lines = {
            line['product_id']: line 
            for line in self._get_previous_stock_snapshot()
        }
        
        moves_needed = []
        
        # Process current products
        for product_id, current in current_lines.items():
            if product_id in previous_lines:
                # Existing product - check quantity change
                previous = previous_lines[product_id]
                qty_diff = current['quantity'] - previous['quantity']
                if qty_diff != 0:
                    moves_needed.append({
                        'product_id': product_id,
                        'quantity': abs(qty_diff),
                        'price_unit': current['price_unit'],
                        'operation': 'receipt' if qty_diff > 0 else 'return'
                    })
            else:
                # New product - need receipt
                moves_needed.append({
                    'product_id': product_id,
                    'quantity': current['quantity'],
                    'price_unit': current['price_unit'],
                    'operation': 'receipt'
                })
        
        # Process removed products
        for product_id, previous in previous_lines.items():
            if product_id not in current_lines:
                # Removed product - need return
                moves_needed.append({
                    'product_id': product_id,
                    'quantity': previous['quantity'],
                    'price_unit': previous['price_unit'],
                    'operation': 'return'
                })
        
        return moves_needed

    def _process_stock_moves(self):
        """Process stock moves based on differential analysis"""
        self.ensure_one()
        
        moves_needed = self._calculate_stock_differences()
        
        if not moves_needed:
            _logger.info(f"No stock moves needed for bill {self.name}")
            return
        
        # Group moves by operation type
        receipts = [m for m in moves_needed if m['operation'] == 'receipt']
        returns = [m for m in moves_needed if m['operation'] == 'return']
        
        created_pickings = []
        
        # Create receipts for increases/new products
        if receipts:
            picking = self._create_stock_picking('incoming', receipts)
            created_pickings.append(('receipt', picking))
        
        # Create returns for decreases/removed products
        if returns:
            picking = self._create_stock_picking('outgoing', returns)
            created_pickings.append(('return', picking))
        
        # Update snapshot
        self.stock_line_snapshot = json.dumps(self._get_current_stock_snapshot())
        
        # Post simple chatter message
        self._post_stock_move_message(created_pickings)

    def _create_stock_picking(self, operation_type, moves_data):
        """Create a stock picking with moves"""
        self.ensure_one()
        
        # Get picking type
        warehouse = self.env['stock.warehouse'].search([
            ('company_id', '=', self.company_id.id)
        ], limit=1)
        
        if operation_type == 'incoming':
            picking_type = warehouse.in_type_id
            location_src = self.env.ref('stock.stock_location_suppliers')
            location_dest = warehouse.lot_stock_id
        else:  # outgoing
            picking_type = warehouse.out_type_id
            location_src = warehouse.lot_stock_id
            location_dest = self.env.ref('stock.stock_location_suppliers')
        
        # Create picking with explicit field values
        picking_vals = {
            'picking_type_id': picking_type.id,
            'partner_id': self.partner_id.id,
            'location_id': location_src.id,
            'location_dest_id': location_dest.id,
            'origin': f"Vendor Bill: {self.name}",
            'company_id': self.company_id.id,
            'vendor_bill_reference': self.name,
        }
        
        # Create picking without passing any context that might interfere
        picking = self.env['stock.picking'].with_context({}).create(picking_vals)
        
        # Create moves
        for move_data in moves_data:
            product = self.env['product.product'].browse(move_data['product_id'])
            move_vals = {
                'name': f"{operation_type.title()}: {product.name}",
                'product_id': product.id,
                'product_uom_qty': move_data['quantity'],
                'product_uom': product.uom_id.id,
                'picking_id': picking.id,
                'location_id': location_src.id,
                'location_dest_id': location_dest.id,
                'company_id': self.company_id.id,
            }
            self.env['stock.move'].with_context({}).create(move_vals)
        
        # Process picking
        picking.action_confirm()
        picking.action_assign()
        picking.button_validate()
        
        return picking

    def _post_stock_move_message(self, created_pickings):
        """Post simple chatter message about stock moves"""
        self.ensure_one()
        
        if not created_pickings:
            return
        
        message_parts = []
        for operation, picking in created_pickings:
            moves = picking.move_ids
            move_details = []
            for move in moves:
                move_details.append(f"{move.product_id.name} ({'+'if operation == 'receipt' else '-'}{move.product_uom_qty:.0f})")
            
            message_parts.append(f"{picking.name} • {' • '.join(move_details)}")
        
        message = f"📦 Stock Move: {' | '.join(message_parts)}"
        
        self.message_post(
            body=message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )


    def _is_latest_bill_for_product(self, product):
        """Check if this bill is the latest for the given product"""
        self.ensure_one()
        
        # Find the most recent posted vendor bill that contains this product
        latest_bill = self.env['account.move'].search([
            ('move_type', '=', 'in_invoice'),
            ('state', '=', 'posted'),
            ('invoice_line_ids.product_id', '=', product.id),
            ('invoice_line_ids.quantity', '>', 0),
            ('invoice_line_ids.display_type', 'in', ['product', False]),
        ], order='date desc, create_date desc', limit=1)
        
        return latest_bill and latest_bill.id == self.id

    def _update_product_costs(self):
        """Update product costs from bill prices - only from latest bills"""
        self.ensure_one()
        
        if self.move_type != 'in_invoice' or self.state != 'posted':
            return
        
        # Get minimum cost difference threshold
        min_cost_diff = float(self.env['ir.config_parameter'].sudo().get_param(
            'auto_stock_update.min_cost_difference', 0.01))
        
        updated_products = []
        
        for line in self._get_stockable_lines():
            product = line.product_id
            
            # Only update if this is the latest bill for this product
            if not self._is_latest_bill_for_product(product):
                _logger.info(f"Skipping cost update for {product.name}: Not the latest bill")
                continue
            
            new_cost = line.price_unit
            
            # Convert to product currency if needed
            if line.currency_id != product.currency_id:
                new_cost = line.currency_id._convert(
                    new_cost, product.currency_id, self.company_id, self.date)
            
            current_cost = product.standard_price or 0.0
            
            # Only update if difference is significant
            if abs(new_cost - current_cost) >= min_cost_diff:
                product.standard_price = new_cost
                updated_products.append({
                    'product': product,
                    'old_cost': current_cost,
                    'new_cost': new_cost
                })
                _logger.info(f"Updated cost for {product.name}: {current_cost} → {new_cost}")
        
        # Post chatter message if any costs were updated
        if updated_products:
            self._post_cost_update_message(updated_products)

    def _post_cost_update_message(self, updated_products):
        """Post chatter message about cost updates"""
        self.ensure_one()
        
        if not updated_products:
            return
        
        cost_details = []
        for update in updated_products:
            product = update['product']
            old_cost = update['old_cost']
            new_cost = update['new_cost']
            cost_details.append(f"{product.name} ({old_cost:.2f} → {new_cost:.2f})")
        
        message = f"💰 Cost Update: {' • '.join(cost_details)}"
        
        self.message_post(
            body=message,
            message_type='comment',
            subtype_xmlid='mail.mt_note'
        )


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'

    line_number = fields.Integer(
        string='Line #',
        compute='_compute_line_number',
        help="Sequential line number for invoice lines"
    )

    def _compute_line_number(self):
        """Simple line numbering for product lines"""
        for line in self:
            if (line.move_id and line.move_id.id and line.display_type == 'product'):
                product_lines = line.move_id.invoice_line_ids.filtered(
                    lambda l: l.display_type == 'product' and l.id
                ).sorted('sequence')
                
                for index, product_line in enumerate(product_lines, 1):
                    if product_line.id == line.id:
                        line.line_number = index
                        break
                else:
                    line.line_number = 0
            else:
                line.line_number = 0