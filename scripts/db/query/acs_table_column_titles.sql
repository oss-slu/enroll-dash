select a.table_id, b.table_title, a.column_id, a.column_title 
from acs.census_column_metadata a
join acs.census_table_metadata b on b.table_id = a.table_id
where a.table_id ilike any(array[
	'b02001%', 'b03003%', 'b08201%', 'b08202%', 'b09002%', 'b11012%', 'b14003%',
	'b15003%', 'b15012%', 'b16007%', 'b24030', 'b25003', 'b25061', 'b25075', 'b25024'
]);