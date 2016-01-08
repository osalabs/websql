/*!
 * jquery.websql.js
 * https://github.com/osalabs/websql
 * Copyright 2014-2016 Oleg Savchuk; Licensed MIT
 */

(function( $ ) {
$.extend({
    db: {
        _dbo: false, //database object
        _is_debug: false, //if true - will log to window.console.log

        defaults: {
            name: 'test',
            version: '1.0',
            displayname: 'Test DB',
            size: 1024*1024    //default - 1Mb
        },

        //methods

        //open database
        open: function (options) {
            if (!window.openDatabase && !window.sqlitePlugin) return; //for those browsers doesn't support db

            var opt = $.extend({}, $.db.defaults, options);

            if (window.sqlitePlugin){
                this._dbo=window.sqlitePlugin.openDatabase({name: opt.name});
            }else{
                this._dbo=window.openDatabase(opt.name, opt.version, opt.displayname, opt.size);
            }

            if (!this._dbo) this._logger("openDatabase failed");
        },

        //run arbitrary query against the db
        //input - sql or [sql, sql, ...], args or [args, args, ...]
        //return - promise object, on resolve return SQLResultSet object (insertId, rowsAffected, rows)
        query: function (sql, args) {
            var def = $.Deferred();
            var last_resultset;
            if ( !$.isArray(sql) ) {
                sql = [sql];
                if (args) args = [args];
            }
            if (!args) args = [];

            this._dbo.transaction($.proxy(function(tx){
                    //run all sql in one transaction
                    $.each(sql, $.proxy(function(i,sqlone){

                        //convenient logging - if arg is one, dump it right with query
                        var argsone=args[i]||'';
                        if (argsone){
                            if (argsone.length==1){
                                this._logger("SQL:"+sqlone,argsone[0]);
                            }else{
                                this._logger("SQL:"+sqlone,argsone);
                            }
                        }else{
                            this._logger("SQL:"+sqlone);
                        }

                        //console.log("SQLONE:"+sqlone);
                        tx.executeSql(sqlone, args[i]||[], function(tx, resultset){ //success callback
                                //console.log(tx,resultset);
                                last_resultset=resultset;
                            });
                    }, this));
                },this),
                $.proxy(function(err){ //transaction error handler
                    this._logger("SQL error:"+err.message, 'sql:'+sql, 'args:', args);
                    def.reject(err);

                },this),
                function(){ //transaction success handler
                    //console.log('transaction success callback- last_resultset=', last_resultset);
                    def.resolve(last_resultset);
                }
            );

            return def.promise();
        },

        /* get value of the one field
        input   - sql, args, optional field_name (if set - fetch from name column, instead of 0 column)
        return  - promise object, on resolve - return single value

        usage:
            $.db.value("select count(*) ctr from table")
                .then(function(value){
                    console.log('db value=',value);
                })
        */
        value: function (sql, args, field_name) {
            var def = $.Deferred();
            this.query(sql,args)
                .done($.proxy(function(data){
                    var result;
                    //get just the first row as we need only one value
                    if ( data.rows && data.rows.length ){
                        //get the first column by order or by name
                        $.each(data.rows.item(0), function(i,v){
                            if (!field_name || field_name==i){
                                result=v;
                                return false;
                            }
                        });
                    }
                    def.resolve(result);

                },this))
                .fail(function(err) {
                    def.reject(err);
                });

            return def.promise();
        },

        /* get one row from $sql (as a hash)
        input   - sql, args (same as for $.db.query)
        return  - promise object, on resolve return row/hash
        */
        row: function (sql, args) {
            var def = $.Deferred();
            this.query(sql,args)
                .then($.proxy(function(data){
                    var result={};
                    //get just the first row
                    if ( data.rows && data.rows.length ){
                        result = data.rows.item(0);
                    }
                    def.resolve(result);

                },this))
                .fail(function(err) {
                    def.reject(err);
                });

            return def.promise();
        },

        /* get array of values for the one column
        input   - sql, args (same as for $.db.query), col_num - optional column name, default = 0
        return  - promise object, on resolve return an array of values
        */
        col: function (sql, args, col_name) {
            var def = $.Deferred();
            this.query(sql,args)
                .then($.proxy(function(data){
                    var result=[];

                    if ( data.rows ){
                        var len = data.rows.length;
                        if (len>0){
                            if (!col_name) col_name = $.db._col_num2name(data,0);

                            for (var i = 0; i < len; i++) {
                                result.push( data.rows.item(i)[col_name] );
                            }
                        }
                    }

                    def.resolve(result);

                },this))
                .fail(function(err) {
                    def.reject(err);
                });

            return def.promise();
        },

        /*  run select query to get array of rows (hashes)
        input   - sql, args (same as for $.db.query)
        return  - promise object, on resolve return array of hashes

        usage:
            $.db.array("select * from table where status=?", [0])
                .then(function(data) {
                    console.log("sql completed successfully, returned data:", data);
                })
                .fail(function(err){
                    console.log("sql failed, error:", err.message);
                });
        */
        array: function (sql, args) {
            var def = $.Deferred();
            this.query(sql,args)
                .then($.proxy(function(data){
                    var rows=[];

                    if ( data.rows ){
                        var len = data.rows.length;
                        for (var i = 0; i < len; i++) {
                            rows.push( data.rows.item(i) );
                        };
                    }

                    def.resolve(rows);

                },this))
                .fail(function(err) {
                    def.reject(err);
                });

            return def.promise();
        },

        /* return row/hash for the table
        shortcut for db.row("select * from table where id=?",[id])

        input   - tablename, id
        return  - promise object, on resolve return row/hash

        usage:
            $.db.obj('plants', 2)
                .then(function(row){
                    console.log('db row=',row);
                })
        */
        obj: function(table, id) {
            return this.row('select * from '+$.db.qq(table)+' where id=?',[id]);
        },

        //alias for "quote"
        q: function (v) {
            return this.quote(v);
        },

        /*db quote - quotes inner quotes and put '' around string
        input   - str'ing
        return  - 'str''ing'

        usage:
            $.db.query( "select * from table where name="+$.db.q(name) );
        */
        quote : function (v) {
            return "'"+new String(v).replace("'","''")+"'";
        },

        //quote for table names, fields
        qq: function (v) {
            return '"'+new String(v).replace('"','')+'"';//table names, fields can't contain doublequote
        },

        /*INSERT INTO table
        input   - table name, vars hash
        return  - promise object, on resolve - return last insert id

        TODO - implement support mutlirows insert (3 args - table,  vars - just field names, values - array of arrays values)

        usage:
            $.db.insert('tablename', {id:4,iname:'test4'})
                .then(function(last_id){
                    console.log('last insert id=',last_id);
                });
        */
        insert: function (table, vars) {
            var def = $.Deferred();
            var cols=[], vals=[], args=[];
            $.each(vars, function(i,v){
                cols.push($.db.qq(i));
                vals.push('?');
                args.push(v);
            });

            var sql = 'insert into '+$.db.qq(table)+' ('+cols.join(',')+') VALUES ('+vals.join(',')+')';

            this.query(sql,args)
                .then($.proxy(function(data){
                    def.resolve(data.insertId);
                },this))
                .fail(function(err) {
                    def.reject(err);
                });

            return def.promise();
        },

        /*UPDATE table SET vars [more_set] WHERE vars_where [more_where]
        input   - table name, vars hash, vars where hash[, more_set, more where]
                 if vars_here contains undefined - NULL used
        return  - promise object, on resolve - return rows affected

        usage:
            $.db.update('tablename', {iname:'test4 update'}, {id:4})
                .then(function(rowsAffected){
                    console.log('rowsAffected=',rowsAffected);
                });
        */
        update: function (table, vars, vars_where, more_set, more_where) {
            var def = $.Deferred();
            if (!more_set) more_set='';
            if (!more_where) more_where='';
            var cols=[], args=[];

            //set fields
            $.each(vars, function(i,v){
                if (typeof(v)=='undefined'){
                    cols.push($.db.qq(i)+'=NULL');
                }else{
                    cols.push($.db.qq(i)+'=?');
                    args.push(v);
                }
            });

            //where conditions
            var colsw=[];
            $.each(vars_where, function(i,v){
                colsw.push($.db.qq(i)+'=?');
                args.push(v);
            });

            var sql = 'update '+$.db.qq(table)+' set '+cols.join(',')+' '+more_set+' where '+colsw.join(',')+' '+more_where;
            //console.log(sql, args);

            this.query(sql,args)
                .then($.proxy(function(data){
                    def.resolve(data.rowsAffected);
                },this))
                .fail(function(err) {
                    def.reject(err);
                });

            return def.promise();
        },

        /*DELETE FROM table WHERE vars_where [more]
        input   - table name, vars where hash[, more]
        return  - promise object, on resolve - return rows affected(delted)

        usage:
            $.db.delete('tablename', {id:4})
                .then(function(rowsAffected){
                    console.log('rowsAffected=',rowsAffected);
                });
        */
        delete:  function (table, vars_where, more) {
            var def = $.Deferred();
            if (!more) more='';
            var colsw=[], args=[];

            //where fields
            $.each(vars_where, function(i,v){
                colsw.push($.db.qq(i)+'=?');
                args.push(v);
            });

            var sql='delete from '+$.db.qq(table)+' where '+colsw.join(',')+' '+more;
            //console.log(sql, args);

            this.query(sql,args)
                .then($.proxy(function(data){
                    def.resolve(data.rowsAffected);
                },this))
                .fail(function(err) {
                    def.reject(err);
                });

            return def.promise();
        },

        //useful to debug from browser console, for example:
        //$.db.value("select count(*) from items").done($.db._dump); - will dump query result to console
        _dump: function (data) {
            console.log(data);
        },

        // private methods
        _logger: function(){
            if (this._is_debug && window.console) {
                if (arguments.length==1){
                    window.console.log(arguments[0]);
                }else if (arguments.length==2){
                    window.console.log(arguments[0], arguments[1]);
                }else{
                    window.console.log(arguments);
                }
            }
        },

        //convert object to hash
        _tohash: function(obj){
            var result={};
            $.each(obj, function(i,v){
                result[i]=v;
            });
            return result;
        },

        //get column name for the column number (0-based) for the data set
        _col_num2name: function(data, col_num) {
            var result;
            //get just the first row as we need only one value
            if ( data.rows && data.rows.item(0) ){
                //get the first column by order or by name
                var n=0;
                $.each(data.rows.item(0), function(i,v){
                    if (n==col_num){
                        result=i;
                        return false;
                    }
                    n++;
                });
            }
            return result;
        },

        1:1
    }//db
});

})( jQuery );
