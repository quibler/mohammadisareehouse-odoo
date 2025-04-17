from odoo import api, fields, models, tools


class PosOrderSalespersonReport(models.Model):
    _name = "report.pos.salesperson"
    _description = "Point of Sale Salesperson Report"
    _auto = False
    _order = 'date desc'

    date = fields.Date(string='Order Date', readonly=True)
    order_id = fields.Many2one('pos.order', string='Order', readonly=True)
    partner_id = fields.Many2one('res.partner', string='Customer', readonly=True)
    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    product_tmpl_id = fields.Many2one('product.template', string='Product Template', readonly=True)
    state = fields.Selection(
        [('draft', 'New'), ('paid', 'Paid'), ('done', 'Posted'),
         ('invoiced', 'Invoiced'), ('cancel', 'Cancelled')],
        string='Status', readonly=True)
    user_id = fields.Many2one('res.users', string='Created by', readonly=True)
    price_total = fields.Float(string='Total Price', readonly=True)
    price_subtotal = fields.Float(string='Subtotal', readonly=True)
    total_discount = fields.Float(string='Total Discount', readonly=True)
    average_price = fields.Float(string='Average Price', readonly=True, group_operator="avg")
    salesperson_id = fields.Many2one('hr.employee', string='Salesperson', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    nbr_lines = fields.Integer(string='Sale Lines Count', readonly=True)
    product_qty = fields.Integer(string='Product Quantity', readonly=True)
    journal_id = fields.Many2one('account.journal', string='Journal', readonly=True)
    delay_validation = fields.Integer(string='Delay Validation', readonly=True)
    product_categ_id = fields.Many2one('product.category', string='Product Category', readonly=True)
    invoiced = fields.Boolean(string='Invoiced', readonly=True)
    config_id = fields.Many2one('pos.config', string='Point of Sale', readonly=True)
    # Removed pos_categ_id field as it's no longer available in Odoo 18
    pricelist_id = fields.Many2one('product.pricelist', string='Pricelist', readonly=True)
    session_id = fields.Many2one('pos.session', string='Session', readonly=True)

    def _select(self):
        return """
            SELECT
                MIN(l.id) AS id,
                COUNT(*) AS nbr_lines,
                s.date_order::date AS date,
                SUM(l.qty) AS product_qty,
                SUM(l.price_subtotal_incl) AS price_total,
                SUM(l.price_subtotal) AS price_subtotal,
                SUM((l.price_unit * l.qty) * (l.discount / 100)) AS total_discount,
                (SUM(l.price_subtotal_incl) / CASE COALESCE(SUM(l.qty), 0) WHEN 0 THEN 1 ELSE SUM(l.qty) END) AS average_price,
                s.id AS order_id,
                s.partner_id AS partner_id,
                s.state AS state,
                s.user_id AS user_id,
                s.salesperson_id AS salesperson_id,
                s.company_id AS company_id,
                s.sale_journal AS journal_id,
                l.product_id AS product_id,
                pt.categ_id AS product_categ_id,
                p.product_tmpl_id AS product_tmpl_id,
                ps.config_id AS config_id,
                s.pricelist_id AS pricelist_id,
                s.session_id AS session_id,
                s.account_move IS NOT NULL AS invoiced,
                EXTRACT(EPOCH FROM (s.date_order::timestamp - s.create_date::timestamp))/(24*60*60)::integer AS delay_validation
        """

    def _from(self):
        return """
            FROM pos_order_line AS l
                LEFT JOIN pos_order s ON (s.id=l.order_id)
                LEFT JOIN product_product p ON (l.product_id=p.id)
                LEFT JOIN product_template pt ON (p.product_tmpl_id=pt.id)
                LEFT JOIN pos_session ps ON (s.session_id=ps.id)
                LEFT JOIN hr_employee emp ON (s.salesperson_id=emp.id)
        """

    def _group_by(self):
        return """
            GROUP BY
                s.id,
                s.date_order,
                s.partner_id,
                s.state,
                s.user_id,
                s.salesperson_id,
                s.company_id,
                s.sale_journal,
                s.pricelist_id,
                s.account_move,
                s.create_date,
                s.session_id,
                l.product_id,
                pt.categ_id,
                p.product_tmpl_id,
                ps.config_id
        """

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute("""
            CREATE OR REPLACE VIEW %s AS (
                %s
                %s
                %s
            )
        """ % (self._table, self._select(), self._from(), self._group_by())
                            )