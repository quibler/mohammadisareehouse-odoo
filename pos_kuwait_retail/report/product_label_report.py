from odoo import models
from collections import defaultdict


class ReportProductTemplateLabelDymo(models.AbstractModel):
    _inherit = 'report.product.report_producttemplatelabel_dymo'

    def _get_report_values(self, docids, data):
        """Override to remove custom_price dependency from wizard"""
        # Get the original report values
        result = super()._get_report_values(docids, data)

        # Custom price is now handled directly from product.custom_label_price field
        # No need to pass custom_price from wizard data anymore

        return result