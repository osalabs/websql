# websql.js
Simple and convenient async work with Web SQL or Cordova with SQLitePlugin databases

Currently implemented as jQuery plugin, accessible via `$.db`
Asynchronous work implemented via jQuery promises.

While Web SQL database API is not supported by all browsers, it still can be used in Webkit browsers. (Chrome, Safari and their mobile versions for Android and iOS). Web SQL databases especially useful if you develop mobile appications with Cordova [SQLitePlugin](https://github.com/litehelpers/Cordova-sqlite-storage)

# Usage/API

## Summary

$.db.open({name: database_name}); //opens database

$.db.value(sql[, args[, field_name]]); //get single value

$.db.row(sql[, args]); //get one row

$.db.obj(table_name, id_value); //get one "object"

$.db.array(sql[, args]); //get multiple rows

$.db.col(sql[[, args], col_name]); //get column

$.db.insert(table_name, data); //insert new row

$.db.update(table_name, data, where[, more_set[, more_where]]); //update table rows

$.db.query(sql[, args]); //arbitrary query execution

$.db.q(unquoted_value); //quote value for query

$.db.qq(unquoted_table_name); //quote table names or field names

**Remember** that all methods returns promise objects, not actual results, so use `.done` or `.then` accordingly. Use `.fail` to handle sql errors.

```js
$.db.array(sql)
.done(function(result){
  //do something with result
})
.fail(function(error){
  //error happened during query
  console.log(error.message);
});
```

Also use `$.when` if you need to get results from multiple async queries

```js
$.when(
  $.db.obj('users',1)
  , $.db.row('select * from settings where users_id=?', [1]) //assume one setting record per user
  , $.db.array('select * from notes where users_id=?', [1])
).done(function(user, user_settings, user_notes){
  //now you have results from all 3 queries
});
```

## Open database

```js
$.db.open({name: 'data.db'}); //opens database data.db

$.db._is_debug=true; //optionally, you may enable debug and see logs in console
```

## Get single value 
$.db.value(sql[, args[, field_name]])

```js
//get single value from the first returned row, first fetched field
$.db.value("select count(*) from users")
.then(function(ctr){
  console.log(ctr); //outputs: 123
});

//get single value with params
$.db.value("select name from users where email=?", ['john@test.com'])
.then(function(name){
  console.log(name); //outputs: Jonh
});

//get single value without params.
//Attention - in this case you need to care about parameter quoting by yourself using $.db.q()
$.db.value("select name from users where email="+$.db.q('john@test.com'))
.then(function(name){
  console.log(name); //outputs: Jonh
});

//get single value with params by field name
$.db.value("select * from users where email=?", ['john@test.com'], 'name')
.then(function(name){
  console.log(name); //outputs: Jonh
});
```

## Get one row
$.db.row(sql[, args])

row returned as an associative array with field names/values

```js
//get first returned row
$.db.row("select * from users where id=?", [1])
.then(function(row){
  console.log(row); //outputs: {id: 1, email: 'john@test.com', name: 'John'}
});

//get first returned row with more params
$.db.row("select * from users where email=? and name=?", ['john@test.com', 'John'])
.then(function(row){
  console.log(row); //outputs: {id: 1, email: 'john@test.com', name: 'John'}
});
```

## Get "object"
$.db.obj(table_name, id_value)

shortcut for `$.db.row("select * from "+table_name+" where id=?",[id_value])` as it frequently useful to fetch one record by id

Note: to use this your db table should have `id` column (primary key).

```js
//get user record by id
$.db.row('users', 1).then(function(user){
  console.log(row); //outputs: {id: 1, email: 'john@test.com', name: 'John'}
});

//using $.when we can get results from multiple queries and then work with it 
var user_id=1;
$.when(
    $.db.obj('user', user_id),
    $.db.array('select * notes where users_id=?', [user_id])
).done(function(user, notes) {
  //now we have user record and all user's notes
});
```

## Get multiple rows
$.db.array(sql[, args])

rows returned as an array of an associative arrays with field names/values

```js
//get all data from table if you really need to
$.db.array("select * from users")
.then(function(rows){
  console.log(rows); //outputs: [
                    //      {id: 1, email: 'john@test.com', name: 'John'},
                    //      {id: 2, email: 'bob@test.com', name: 'Bob'},
                    //      {id: 3, email: 'alice@test.com', name: 'Alice'},
                    //      ...
                    //          ]
});

//get all notes for the particular user
$.db.array("select * from notes where users_id=?", [1])
.then(function(rows){
  console.log(rows); //outputs: [
                    //      {id: 1, note: 'note one', users_id: 1},
                    //      {id: 2, note: 'note two', users_id: 1},
                    //      {id: 3, note: 'note three', users_id: 1},
                    //      ...
                    //          ]
});

```

## Get column values for all rows
$.db.col(sql[[, args], col_name])

column values returned as a plain array

```js
//fetch all id's from table
$.db.col("select id from users")
.then(function(ids){
  console.log(ids); //outputs: [1,2,3,4...]
});

//fetch name stats from second column
$.db.col("select name, count(*) ctr from users group by name", [], 'ctr')
.then(function(counts){
  console.log(counts); //outputs: [3,5,6...]
});
```

## Insert data into table
$.db.insert(table_name, data)

`data` must be an associative array with field names/values to insert. Return (via promise) last insert id
```js
//insert new user record
var data={
  email: 'new@test.com',
  name: 'Newbie'
};
$.db.insert('users', data).done(function(new_id){
  console.log(new_id); //outputs: 124
});
```

## Update data in table
$.db.update(table_name, data, where[, more_set[, more_where]])

`data` must be an associative array with field names/values to save to db

`where` - an associative array with field names/values to use in where (all fields combined via AND conditions)

`more_set` - optional, string with arbitrary sql to use in SET section

`more_where` - optional, string with arbitrary sql to use in WHERE section

returns (via promise) rows affected
```js
//update John to Billy
var data={
  name: 'Billy'
};
var where={
  id: 1
};
$.db.update('users', data, where).done(function(rows_affected){
  console.log(rows_affected); //outputs: 1
});

//more complex update
var data={
  name: 'Billy'
};
var where={};
var more_set=", upd_time=now()"; //add this way because now() can't be passed as params
var more_where=" and (id<10 or id>100)"; //set this way because of complex where
$.db.update('users', data, where, more_set, more_where).done(function(rows_affected){
  console.log(rows_affected); //outputs: 123
});
```

## Delete data from table
$.db.delete(table_name, where[, more_where])

`where` - an associative array with field names/values to use in where (all fields combined via AND conditions)

`more_where` - optional, string with arbitrary sql to use in WHERE section

returns (via promise) rows affected
```js
//delete user by id
$.db.update('users', {id: 1}).done(function(rows_affected){
  console.log(rows_affected); //outputs: 1
});

//more complex delete
var where={};
var more_where=" and upd_time<now()"; //set this way because of complex where
$.db.update('users', where, more_where).done(function(rows_affected){
  console.log(rows_affected); //outputs: 123
});
```

## Arbitrary queries
$.db.query(sql[, args])

You may also call queries directly if wrapper functions is not enough. `args` is a plain array for params.
```js
//single statement query
$.db.query("select * from users")
.then(function(SQLResultSet){
  //returns SQLResultSet object (insertId, rowsAffected, rows)
  console.log(SQLResultSet);
});

//query without record returned
$.db.query("delete from users where id=?", [1]);
```

## Misc functions

```js
var quoted_value = $.db.quote(unquoted_value); //quote value - quotes inner quotes and put '' around string
var quoted_value = $.db.q(unquoted_value); //.q is a shortcut alias for .quote
var quoted_table_name = $.db.qq(unquoted_table_name); //quote table names or field names with doublequotes around string

$.db.value("select count(*) from users").done($.db._dump); //will dump query result to console
```
