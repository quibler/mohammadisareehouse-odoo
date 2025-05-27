from odoo import models, fields, api, _
from odoo.exceptions import UserError
import re

class ProductProduct(models.Model):
    _inherit = 'product.product'

    @api.model_create_multi
    def create(self, vals_list):
        """Override create to auto-generate barcode if empty."""
        for vals in vals_list:
            # Check if barcode is not provided or is empty
            if 'barcode' not in vals or not vals.get('barcode'):
                # Generate barcode using the sequence
                generated_code = self.env['ir.sequence'].next_by_code('product.barcode.sequence')

                if generated_code:
                    # For Code128, we can use alphanumeric codes directly
                    vals['barcode'] = generated_code
                else:
                    raise UserError(_("Could not generate barcode sequence."))

            # Validate provided barcode format for Code128
            elif vals.get('barcode'):
                barcode = vals['barcode'].strip()
                # Code128 can handle most printable ASCII characters
                # Allow alphanumeric, dash, space, and some special characters
                if barcode and not re.match(r'^[A-Za-z0-9\-\s\._]+$', barcode):
                    raise UserError(_("Barcode '%s' contains invalid characters for Code128 format.") % barcode)
                vals['barcode'] = barcode

        # Call the original create method
        products = super(ProductProduct, self).create(vals_list)
        return products

    @api.constrains('barcode')
    def _check_barcode_validity(self):
        """Ensure barcode is valid for Code128 format when set."""
        for product in self:
            if product.barcode:
                # Basic validation for Code128 - alphanumeric, dash, space, underscore, dot
                if not re.match(r'^[A-Za-z0-9\-\s\._]+$', product.barcode):
                    raise UserError(_("Product '%s' has an invalid barcode format: %s") % (product.name, product.barcode))

    # Ensure barcode uniqueness system-wide
    _sql_constraints = [
        ('barcode_uniq', 'unique(barcode)', 'A barcode can only be assigned to one product!')
    ]