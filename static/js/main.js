'use strict';

/**
 * $.parseParams - parse query string paramaters into an object.
 * https://gist.github.com/kares/956897
 */
(function($) {
var re = /([^&=]+)=?([^&]*)/g;
var decodeRE = /\+/g;  // Regex for replacing addition symbol with a space
var decode = function (str) {return decodeURIComponent( str.replace(decodeRE, " ") );};
$.parseParams = function(query) {
    var params = {}, e;
    while ( e = re.exec(query) ) {
        var k = decode( e[1] ), v = decode( e[2] );
        if (k.substring(k.length - 2) === '[]') {
            k = k.substring(0, k.length - 2);
            (params[k] || (params[k] = [])).push(v);
        }
        else params[k] = v;
    }
    return params;
};
})(jQuery);


function start(deployments, owner, repo, callback) {

  var shas = {};
  $('#deployments').append($('<th>').text('Master'));
  $.each(deployments, function(i, thing) {
    var $th = ($('<th>').attr('id', thing.name+'-col')
      .append($('<a>').attr('title', 'Show column in Bugzilla').text(thing.name)));
    $('#deployments').append($th);
    shas[thing.name] = thing.sha;
  });
  function commit_url(sha) {
    return 'https://github.com/' + owner + '/' + repo + '/commit/' + sha;
  }
  function bug_url(id) {
    return 'https://bugzilla.mozilla.org/show_bug.cgi?id=' + id;
  }
  function bug_id(msg) {
    if (msg.match(/\b\d{6,7}\b/g)) {
      return msg.match(/\b\d{6,7}\b/g)[0];
    }
    return false;
  }

  function link_cols() {
    $.each(deployments, function(i, thing) {
      if (thing.bugs.length) {
        var bug_query = thing.bugs.join('%2C');
        $('#'+thing.name+'-col a')
          .attr('href', 'https://bugzilla.mozilla.org/buglist.cgi?bug_id='+bug_query+'&bug_id_type=anyexact&bug_status=ALL');
      }
    });
  }

  function makeMessage(commit) {
    var msg = commit.commit.message;
    var msg_split = msg.split(/\n\n+/);
    var msg_first;
    if (msg_split.length === 1) {
      msg_first = msg;
    } else {
      msg_first = msg_split[0];
    }
    var sha = commit.sha;
    var cell = $('<td>');
    if (commit.author && commit.author.avatar_url) {
      cell.append(
        $('<a>')
        .attr('href', commit.author.html_url)
        .append(
          $('<img>')
          .addClass('avatar')
          .attr('src', commit.author.avatar_url)
          .attr('width', '44')
          .attr('height', '44')
        )
      );
    }
    var bug_number = bug_id(msg);
    if (bug_number) {
      cell.append($('<a>')
                  .attr('href', bug_url(bug_number))
                  .data('id', bug_number)
                  .addClass('bug-' + bug_number)
                  .addClass('bugzilla')
                  .text(bug_number));
      cell.append($('<span>')
                  .text(' - '));
    }
    cell.append($('<a>')
                .attr('href', commit.html_url)
                .attr('title', msg)
                .text(msg_first));
    return cell;
  }
  //var first_sha = deployments[0].sha;
  $('#cap').hide();
  var commitsURL = '/githubapi/commits';
  $.getJSON(commitsURL, {owner: owner, repo: repo, per_page: 60},
      function(response) {

    var matched = {};
    var $commits = $('#commits');
    var keep_going = true;
    var cap = true;

    $.each(response, function(i, commit) {
      if (!keep_going && cap) return;
      $.each(shas, function(name, sha) {
        if (sha === commit.sha) {
          matched[name] = true;
        } else if (sha === commit.sha.substring(0, 7)) {
          matched[name] = true;
          commit.sha = commit.sha.substring(0, 7);
        }
      });
      var row = $('<tr>').append(makeMessage(commit));
      var all = true;
      $.each(deployments, function(i, thing) {
        if (matched[thing.name]) {
          row.append($('<td>').addClass('checked'));
          var bug_number = bug_id(commit.commit.message);
          if (bug_number) thing.bugs.push(bug_number);
        } else {
          all = false;
          row.append($('<td>').text(''));
        }
      });
      row.appendTo($commits);
      if (all) {
        link_cols();
        fetchBugzillaMetadata();
        culprits(owner, repo, deployments);
        keep_going = false;
        $('#cap').show();
      }
    });

    var req = $.post('/shortenit', {url: location.href});
    req.then(function(r) {
      $('#shorten a').attr('href', r.url).text(
        location.protocol + '//' + location.host + r.url
      );
      $('#shorten').show();
    });
    req.fail(function(jqXHR, textStatus, errorThrown) {
      console.warn('URL shortening service failed', errorThrown);
    });

  })
  .fail(function() {
    console.error.apply(console, arguments);
    showGeneralError(
      'Unable to download commits for "' + commitsURL + '"'
    );
  });
}

function showGeneralError(html) {
  $('#error p').text(html);
  $('#table').hide();
  $('#cloak').hide();
  $('#error').hide().fadeIn(300);
}

function showCulpritsError(html) {
  $('#culprits-error p').text(html);
  $('#culprits-error').hide().fadeIn(300);
}


function init(owner, repo, deployments, callback) {
  document.title = "What's deployed on " + owner + "/" + repo + "?";
  var req = $.ajax({
    url: '/shas',
    type: 'POST',
    data: JSON.stringify(deployments),
    contentType: 'application/json'
  });
  req.then(function(response) {
    if (response.error) {
      showGeneralError(response.error);
    } else {
      start(response.deployments, owner, repo);
    }
    var titletag = document.head.querySelector(
      'meta[name="apple-mobile-web-app-title"]'
    );
    // Make it really short in case someone saves it to their Home screen
    // on an iPhone
    titletag.content = 'WD ' + repo;
    if (callback) callback();
  });
  req.fail(function(jqxhr, status, error) {
    console.warn("Unable to convert deployments to sha", status, error);
    showGeneralError(error);
  });
  var repo_url = 'https://github.com/' + owner + '/' + repo;
  $('.repo').append($('<a>').attr('href', repo_url).text(repo_url));
  $.each(deployments, function(i, each) {
    $('<dd>').append($('<a>').attr('href', each.url).text(each.name))
      .insertAfter('.urls');
  });
}


function paramsToDeployment(qs, callback) {
  var params = $.parseParams(qs.split('?')[1]);
  var owner, repo;
  if (params.owner) {
    owner = params.owner;
    $('#owner').val(owner);
  }
  if (params.repo) {
    repo = params.repo;
    $('#repo').val(repo);
  }
  var names = params.name;
  if (!names) {
    throw "No parameter called 'names'";
  }
  var urls = params.url;
  if (!urls) {
    throw "No parameter called 'urls'";
  }
  var deployments = [];
  $.each(names, function(i, name) {
    if (i >= $('input[name="name[]"]').length) {
      $('a.more').click();
    }
    $('input[name="name[]"]').eq(-1).val(name);
    var url = urls[i];
    $('input[name="url[]"]').eq(-1).val(url);
    deployments.push({name: name, url: url});
  });
  if (owner && repo && deployments.length > 0) {
    init(owner, repo, deployments, callback);
    $('form').hide();
  } else if (callback) {
    callback();
  }
}

function culprits(owner, repo, deployments) {
  $.ajax({
    url: '/culprits',
    type: 'POST',
    data: JSON.stringify({
      owner: owner,
      repo: repo,
      deployments: deployments,
    }),
    contentType: 'application/json'
  })
  .then(function(response) {
    if (response.error) {
      showCulpritsError(response.error);
      return;
    }
    var container = $('#culprits');
    $.each(response.culprits, function(i, group) {
      $('<h4>').append(
        $('<span>On </span>').addClass('on-prefix')
      ).append(
        $('<span>').text(group.name)
      ).appendTo(container);
      var users = $('<div>').addClass('users');
      $.each(group.users, function(j, userinfo) {
        var user_container = $('<div>').addClass('media');
        $('<a>')
        .attr('href', userinfo[1].html_url)
        .attr('target', '_blank')
        .attr('rel', 'noopener')
        .attr('title', userinfo[1].login)
        .append(
          $('<img>')
          .addClass('mr-3').addClass('avatar')
          .attr('width', '44')
          .attr('height', '44')
          .attr('src', userinfo[1].avatar_url)
        )
        .appendTo(user_container);
        $('<div>').addClass('media-body')
        .append(
          $('<h5>').addClass('mt-0').append(
            $('<a>')
            .attr('href', userinfo[1].html_url)
            .text(userinfo[1].login)
          )
        ).append(
          $('<p>').text(userinfo[0])
        )
        .appendTo(user_container);
        user_container.appendTo(container);
      });
      users.appendTo(container);
      if (group.links.length) {
        $('<h5>').text('Links').appendTo(container);
      }
      $.each(group.links, function(i, link) {
        $('<a>')
        .attr('target', '_blank')
        .attr('rel', 'noopener')
        .attr('href', link)
        .text(link)
        .appendTo(container);
      });
    });
    container.show();
  })
  .fail(function(jqxhr, status, error) {
    console.warn("Unable to convert deployments to culprits", status, error);
    showCulpritsError(error);
  });
}

function fetchBugzillaMetadata() {
  var ids = [];
  $('a.bugzilla').each(function() {
    ids.push($(this).data('id'));
  });
  if (!ids.length) return;
  var data = {id: ids.join(','), include_fields: 'status,id,resolution'};
  var req = $.ajax({
    url: 'https://bugzilla.mozilla.org/rest/bug',
    data: data,
    contentType: 'application/json',
    accepts: 'application/json'
  });
  req.done(function(response) {
      if (response.bugs) {
        $.each(response.bugs, function(i, bug) {
          var $links = $('a.bug-' + bug.id);
          $links.attr('title', bug.status + ' ' + bug.resolution);
          if (bug.status === 'RESOLVED' || bug.status === 'VERIFIED') {
            $links.addClass('resolved');
          }
        });
      }
  });
}


/* Return an interval you can clear if you want to. */
function makeProgressBar() {
  var bar = $('#cloak .progress-bar');
  var progress = 0;
  var interval = setInterval(function() {
    bar
    .css('width', '' + progress + '%')
    .attr('aria-valuenow', '' + progress);
    var increment = 10;
    if (progress > 90) {
      increment = 1;
    } else if (progress > 80) {
      increment = 2;
    } else if (progress > 50) {
      increment = 4;
    }
    progress += increment;
    if (progress >= 100) {
      clearInterval(interval);
    }
    if (progress > 95) {
      if (!bar.hasClass('bg-danger')) {
        bar.removeClass('bg-warning').addClass('bg-danger');
      }
    } else if (progress > 85) {
      if (!bar.hasClass('bg-warning')) {
        bar.removeClass('bg-success').addClass('bg-warning');
      }
    }
  }, 300);
  return interval;
}

/* Return an interval you can clear if you want to. */
function makeDotter() {
  var c = $('#cloak .dots');
  var interval = setInterval(function() {
      c.text(c.text() + '.');
      // if (c.text().match(/\./g).length > 20) {
      //   clearInterval(dotter);
      //   $('#cloak p').text(" F' it! I give up! This is taking too long.");
      // }
  }, 1000);
  return interval;
}

function giveUp() {
  if ($('#cloak:visible').length) {
    $('#cload .progress').hide();
    $('#cloak p').text(" F' it! I give up! This is taking too long.");
  }
}


$(function() {

  $('a.more').click(function() {
    $('.revisions')
      .append($('<input type="text" name="name[]" class="form-control name" placeholder="Name">'))
      .append($('<input type="text" name="url[]" class="form-control url" placeholder="URL to revision data">'));
    return false;
  });

  $('button.reload').on('click', function() {
    document.location.reload(true);
  });

  if (location.search) {

    var dotter = makeDotter();
    var progressBarer = makeProgressBar();

    paramsToDeployment(location.search, function() {
      $('h2').text($('h2').text().replace('?', ''));
      $('#cloak').hide();
      $('#table').hide().fadeIn(500);
      clearInterval(dotter);
      clearInterval(progressBarer);
    });

    setTimeout(function() {
      // If the cloak is still visible, that means took more than this time
      // for the paramsToDeployment() to call back. This is our equivalent
      // of a timeout.
      giveUp();
      clearInterval(dotter);
      clearInterval(progressBarer);
    }, 10000);

  } else {
    $('#cloak').hide();
    $('form').hide().fadeIn(500);
  }

});
