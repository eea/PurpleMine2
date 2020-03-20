$(function () {
  /* global PurpleMine */
  'use strict';

  /* eslint-disable no-new */
  if (window.PurpleMine) {
    new PurpleMine.SidebarToggler();
    new PurpleMine.HistoryTabs();
    new PurpleMine.MenuCollapse();
  }

  /* EEA fixes */
  function moveElementAbove(el_1, el_2) {
    $(el_1).next().filter(el_2).insertBefore(el_1);
  }

  // function moveElementBelow(el_1, el_2) {
  //   $(el_1).prev().filter(el_2).insertAfter(el_1);
  // }

  moveElementAbove('.members.box', '.projects.box');

  // #106078 block search for anonymous
  function blockSearchAnonymous(){
    if (!$('#loggedas').length) {
        $('#quick-search form').hide();
        document.cookie='_redmine_eea=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
    else {
        var d = new Date();
        d.setTime(d.getTime() + 86400000);
        document.cookie='_redmine_eea=1; expires='+d.toUTCString()+';path=/';
    }
  }

  blockSearchAnonymous();

  // Redmine 4.0.3 fixes, see #104603
  function fixHistoryView(){
      var length = $('#issue-changesets').nextUntil('#history').length;
      var i = 0;
      while (i < length) {
        $('#history').prev().insertAfter('#history');
        i++;
      }
  }

  fixHistoryView();

  function editWikiQuickSearch() {
    var pathname = window.location.pathname;
    if  ((pathname.match('/projects/.*/wiki/.*/edit') || pathname.match('/projects/.*/wiki/.*/rename')) && jQuery('#wiki_page_parent_id').length > 0) {
	    $('#wiki_page_parent_id').select2();
	    $('body').addClass('page_that_uses_select2');
    }
  }

  /* #114732 prefill payment id when editing or adding a new time entry */
  var $log_payment = jQuery("#time_entry_custom_field_values_36");
  var $ticket_payment = jQuery("#issue_custom_field_values_71");
  var ticket_payment_value = $ticket_payment.val();
  var $log_payment_parent =  $log_payment.parent();
  $log_payment_parent.before($(
    '<div class="conflict hidden" id="wrong_payment">' +
    '<strong>Different Payment Rerefence ID selected</strong>' +
    '<div class="conflict-details conflict-journal">' +
    'Be aware that you are using a different <em>Payment Reference ID</em> from what was defined in the ticket to use: ' +
    '<em id="wrong_payment_correct_value"></em>' +
    '</div>' +
    '</div>'
  ));
  var $wrong_payment = $("#wrong_payment");
  var prefillPaymentId = function() {
    if (ticket_payment_value) {
      $(".contextual").find('.icon-edit, .icon-comment').on('click', function(){
        $log_payment.prop("value", ticket_payment_value);
        if (!$wrong_payment.hasClass('hidden')) {
          $wrong_payment.addClass('hidden');
        }
      });
    }
  };
  prefillPaymentId();

  var site_url = window.location.origin;
  var current_url = window.location.href;

  var getUserToken = (function() {
    var dfd = $.Deferred();
    jQuery.get(site_url + "/my/api_key").done(function(res) {
      var $res = jQuery(res);
      var $user = $(".user");
      return dfd.resolve({
        id: window.parseInt($user.attr('href').match(/\d+/g)[0]),
        api_key: $res.find('pre').text()
      });
    });
    return dfd.promise();
  }());

  var isAssignedUserDeveloper = function(user) {
    var dfd = $.Deferred();
    var assigned_user_is_developer;
    var api_key = user.api_key;
    var $user_info = $(".assigned-to").find('.user');
    var user_id = $user_info.attr('href');
    var user_name = $user_info.text();
    if (!user_id) {
      return dfd.reject();
    }
    user_id = window.parseInt(user_id.match(/\d+/g)[0]);
    // var project_id = $("body").attr('class').match(/project-\w+/g)[0].split('-')[1];
    var project_name = $(".current-project").text();

    jQuery.ajax(site_url + "/users/" + user_id + ".json", {
      headers: {
        'X-Redmine-API-Key': api_key,
        'Content-Type': 'application/json'
      },
      data: {
        include: 'memberships'
      },
      dataType: 'json',
      type: 'GET'
    }).done(function(res) {
      if (!res.user) {
        return dfd.reject();
      }
      var memberships = res.user.memberships || [];
      memberships.forEach(function(membership) {
        if (membership.project.name !== project_name) {
          return;
        }
        var roles = membership.roles || [];
        roles.forEach(function(role) {
          if (role.id === 4) {
            assigned_user_is_developer = true;
          }
        });
      });
      return dfd.resolve({is_developer: assigned_user_is_developer, user_id: user_id, user_name: user_name, api_key: api_key })
    });

    return dfd.promise();
  };

  var getAssignedUserOverloadStatus = function(user) {
    var user_id = user.user_id;
    user.is_overloaded = false;
    var dfd = $.Deferred();
    if (!user.is_developer) {
      return dfd.reject();
    }

    var issues_by_type = {"Assigned issues": 0};

    jQuery.ajax(site_url + "/issues.json", {
      headers: {
        'X-Redmine-API-Key': user.api_key,
        'Content-Type': 'application/json'
      },
      data: {
        assigned_to_id: user.user_id,
        limit: 500,
        status_id: '2|4|8|9',
        project_id: 'nanyo'
      },
      dataType: 'json',
      type: 'GET'
    }).done(function(res) {
      var issues = res.issues;
      console.log(issues.length);
      issues.forEach(function(issue){
        var issue_status;
        if (issue.assigned_to.id !== user_id) {
          return;
        }
        issue_status = issue.status.name;
        issue_status in issues_by_type ? ++issues_by_type[issue_status] : issues_by_type[issue_status] = 1;
      });
      issues_by_type['Assigned issues'] = Object.values(issues_by_type).reduce(function(accumulator, currentValue) { return  accumulator + currentValue});
      console.log(issues_by_type);
      if (issues_by_type['Assigned issues'] >= 4) {
        user.is_overloaded = true;
        user.issues = issues_by_type;
      }
      return dfd.resolve(user);
    });
    return dfd.promise();
  };

  var addWIPLimitUI = function(user) {
    var $parent = $(".assigned-to .value");
    var $overload_icon = $("<span class='fa fa-2x fa-hand-paper overloaded-user-warning' />").appendTo($parent);
    var $overload_construct = $("<div class='overloaded-user'>" +
      "<div class='overloaded-user-head'><strong>WIP-limit reached</strong></div>" +
      "<div class='overloaded-user-body'></div> " +
      "<div class='overloaded-user-footer'>" +
      "<p>Why we care about WIP-limits? <a href='#' target='_blank' class='overloaded-user-link'>Get it!</a></p>" +
      "</div>" +
      "</div>");
    Object.entries(user.issues).forEach(function(issue) {
      var issue_category = issue[0];
      var link_to_assigned_issues;
      var text = "<p class='overloaded-user-issue-category'>" + issue_category + ": " + issue[1] + "</p>";
      if (issue_category.indexOf('Assigned issues') !== -1) {
        link_to_assigned_issues = "<a target='_blank' class='overloaded-user-link assigned_issues_link' href='"
          + site_url + "/issues?"
          + "set_filter=1&sort=priority%3Adesc%2Cupdated_on%3Adesc"
          + "&f[]=status_id&op[status_id]==&v[status_id][]=2&v[status_id][]=4&v[status_id][]=8"
          + "&f[]=assigned_to_id&op[assigned_to_id]==&v[assigned_to_id][]="
          + user.user_id
          + "'>";
        link_to_assigned_issues = link_to_assigned_issues + text + "</a>"
      }
      $overload_construct.find('.overloaded-user-body').append(link_to_assigned_issues || text);
    });

    $overload_construct.appendTo($parent)
      .dialog({
        title: user.user_name + " is overloaded",
        width: 300,
        autoOpen: false,
        position: { my: "left top",  of: $overload_icon }
      });

    $overload_icon.on('mouseenter', function(ev) {
      $overload_construct.dialog("open");
    });
  };

  var is_on_issue_page = current_url.indexOf('/issues') !== -1;
  if (is_on_issue_page && window.location.search.indexOf('wip') !== -1) {
    getUserToken.then(isAssignedUserDeveloper)
      .then(getAssignedUserOverloadStatus)
      .then(function(user) {
        if (user.is_overloaded) {
          addWIPLimitUI(user);
        }
      });
  }

  var prefillPaymentIdOnTimeEntriesPage = function() {
    var is_on_time_entries = current_url.indexOf('time_entries/new') !== -1;
    var issue_number;
    if (is_on_time_entries) {
      getUserToken.then(function(res) {
        issue_number = $("#time_entry_issue_id").val();

        if (!issue_number) {
          return;
        }

        jQuery.ajax(site_url + "/issues/" + issue_number + '.json', {
          headers: {
            'X-Redmine-API-Key': res.api_key.toString(),
            'Content-Type': 'application/json'
          },
          processData: false,
          dataType: 'json',

          type: 'GET'
        }).done(function(res){
          var time_ticket = res.issue.custom_fields.filter(function(el) {
             return el.name.indexOf('Payment') !== -1;
          });

          if (!time_ticket.length) {
            return;
          }
          ticket_payment_value =  time_ticket[0].value;
          var $wrong_payment_correct_value = $wrong_payment_correct_value || $("#wrong_payment_correct_value");
          $wrong_payment_correct_value.text(ticket_payment_value);
          $log_payment.val(ticket_payment_value);
        });
      });
    }
  };
  prefillPaymentIdOnTimeEntriesPage();

  var $wrong_payment_correct_value = $("#wrong_payment_correct_value");
  $wrong_payment_correct_value.text(ticket_payment_value);
  $log_payment.change(function(){
      var value = $(this).val();
      if (ticket_payment_value) {
        if ( value && value !== ticket_payment_value) {
          $wrong_payment.removeClass('hidden');
        }
        else {
          $wrong_payment.toggleClass('hidden');
        }
      }
  });

  editWikiQuickSearch();
});
